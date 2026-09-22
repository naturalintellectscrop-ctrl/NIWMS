// =============================================================================
// NIWMS Payment Service — the domain boundary between billing and Nylon Pay.
//
//      NIWMS Billing Domain (/api/billing, /app/billing)
//              ↓
//      NIWMS Payment Service (this file)
//              ↓
//      src/lib/payments/nylonpay.ts (provider boundary)
//              ↓
//      Nylon Pay API / hosted invoices / signed webhooks
//
// NIWMS stays authoritative for: organization, subscription, plan,
// entitlements, employee limits, lifecycle state, trial, grace, suspension,
// audit history. Nylon Pay is authoritative for: the payment transaction, its
// provider reference, its processing state, and payment confirmations. The two
// domains reconcile ONLY through verified server-side events (signed webhooks
// + server-side transaction lookup) — never through the browser redirect.
//
// Amounts are computed exclusively by the canonical billing engine
// (computeQuote) from the canonical plan record in the database. The browser
// can only name a plan code and an interval; it can never set money.
// =============================================================================

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { computeQuote, addCalendarMonths, type BillingInterval } from '@/lib/billing/pricing'
import { getNylonPay, isTerminalProviderStatus, normalizeProviderStatus } from '@/lib/payments/nylonpay'

export const PAYMENT_PROVIDER = 'nylonpay'
export const PAYMENT_STATUSES = ['pending', 'processing', 'on_hold', 'successful', 'failed', 'cancelled'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
const OPEN_STATUSES: PaymentStatus[] = ['pending', 'processing', 'on_hold']
const INTERVALS: BillingInterval[] = ['monthly', 'quarterly', 'annual']

/** Email that receives hosted invoices when no admin has an email-like username. */
const MERCHANT_BILLING_FALLBACK_EMAIL = 'naturalintellectscrop@gmail.com'

export class PaymentServiceError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Types shared with the API routes
// ---------------------------------------------------------------------------

export interface PaymentView {
  id: string
  reference: string
  kind: string
  status: PaymentStatus
  amountUgx: number
  currency: string
  billingInterval: BillingInterval
  planName: string
  description: string
  checkoutUrl: string | null
  invoiceNumber: string | null
  providerTransactionId: string | null
  periodStart: string | null
  periodEnd: string | null
  mode: string | null
  failureReason: string | null
  failureCode: string | null
  initiatedAt: string
  completedAt: string | null
}

export function toPaymentView(payment: {
  id: string
  reference: string
  kind: string
  status: string
  amountUgx: number
  currency: string
  billingInterval: string
  description: string
  checkoutUrl: string | null
  invoiceNumber: string | null
  providerTransactionId: string | null
  periodStart: Date | null
  periodEnd: Date | null
  mode: string | null
  failureReason: string | null
  failureCode: string | null
  initiatedAt: Date
  completedAt: Date | null
}, planName: string): PaymentView {
  return {
    id: payment.id,
    reference: payment.reference,
    kind: payment.kind,
    status: normalizeProviderStatus(payment.status),
    amountUgx: payment.amountUgx,
    currency: payment.currency,
    billingInterval: (INTERVALS as string[]).includes(payment.billingInterval) ? (payment.billingInterval as BillingInterval) : 'monthly',
    planName,
    description: payment.description,
    checkoutUrl: payment.checkoutUrl,
    invoiceNumber: payment.invoiceNumber,
    providerTransactionId: payment.providerTransactionId,
    periodStart: payment.periodStart?.toISOString() ?? null,
    periodEnd: payment.periodEnd?.toISOString() ?? null,
    mode: payment.mode,
    failureReason: payment.failureReason,
    failureCode: payment.failureCode,
    initiatedAt: payment.initiatedAt.toISOString(),
    completedAt: payment.completedAt?.toISOString() ?? null,
  }
}

async function auditOrganization(organizationId: string | null, actorUserId: string | null, action: string, metadata: Record<string, unknown>, resourceType = 'SaaSPayment', resourceId?: string) {
  await db.saaSAuditLog.create({
    data: {
      organizationId,
      actorUserId,
      action,
      resourceType,
      resourceId: resourceId ?? null,
      metadata: JSON.stringify(metadata),
    },
  })
}

// ---------------------------------------------------------------------------
// Checkout initiation (server-side price authority)
// ---------------------------------------------------------------------------

function resolveInterval(raw: unknown, fallback: BillingInterval): BillingInterval {
  return INTERVALS.includes(raw as BillingInterval) ? (raw as BillingInterval) : fallback
}

async function resolveCustomerEmail(organizationId: string): Promise<{ email: string; name: string; phone: string | null }> {
  // SaaSOrganizationMembership has no Prisma relation to User (legacy schema
  // split) — resolve admin usernames through a two-step query.
  const memberships = await db.saaSOrganizationMembership.findMany({
    where: { organizationId, status: 'active', role: { in: ['owner', 'admin'] } },
    select: { userId: true },
  })
  const users = memberships.length > 0
    ? await db.user.findMany({ where: { id: { in: memberships.map((m) => m.userId) }, status: 'active' }, select: { username: true } })
    : []
  const emailLike = users.map((u) => u.username).find((username) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username))
  const organization = await db.saaSOrganization.findUnique({ where: { id: organizationId }, select: { name: true } })
  return {
    email: emailLike ?? MERCHANT_BILLING_FALLBACK_EMAIL,
    name: organization?.name ?? 'NIWMS customer',
    phone: null,
  }
}

export interface StartCheckoutInput {
  organizationId: string
  userId: string | null
  /** Optional plan code; defaults to the organization's current plan. */
  planCode?: unknown
  /** Optional interval; defaults to the subscription's current interval. */
  interval?: unknown
  /** 'initial' (first charge / upgrade) or 'renewal' (cron-driven per-period invoice). */
  kind?: 'initial' | 'renewal'
}

export interface StartCheckoutResult {
  payment: PaymentView
  reused: boolean
  quote: ReturnType<typeof computeQuote>
}

/**
 * Create (or idempotently reuse) a Nylon Pay hosted-checkout payment for the
 * organization. The price is ALWAYS computed here from the canonical plan and
 * interval — client input never touches money, currency, or organization.
 */
export async function startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
  const organization = await db.saaSOrganization.findUnique({
    where: { id: input.organizationId },
    include: { subscriptions: { include: { plan: true } } },
  })
  if (!organization) throw new PaymentServiceError('Organization not found', 404)
  if (organization.billingMode === 'exempt') {
    throw new PaymentServiceError('This organization has complimentary access — no payment is required', 409)
  }
  if (organization.status === 'banned' || organization.status === 'suspended' || organization.status === 'archived') {
    throw new PaymentServiceError('This organization cannot start a checkout in its current state', 409)
  }

  const subscription = organization.subscriptions[0] ?? null
  const requestedPlanCode = typeof input.planCode === 'string' ? input.planCode.trim().toLowerCase() : null
  const plan = requestedPlanCode
    ? await db.saaSPlan.findFirst({ where: { code: requestedPlanCode, isActive: true } })
    : subscription?.plan ?? null
  if (!plan) throw new PaymentServiceError('Unknown or inactive plan', 400)
  if (plan.monthlyPriceCents <= 0) {
    throw new PaymentServiceError('This plan uses custom pricing — contact Natural Intellects for a quote', 409)
  }

  const interval = resolveInterval(input.interval, resolveInterval(subscription?.billingInterval, 'monthly'))
  const kind = input.kind === 'renewal' ? 'renewal' : 'initial'
  const now = new Date()
  const monthlyPriceUgx = plan.monthlyPriceCents / 100
  // The single source of money truth — the same engine behind the marketing
  // calculator and the workspace quote. Whole UGX (ISO 4217 exponent 0).
  const quote = computeQuote({ monthlyPrice: monthlyPriceUgx, interval, startsAt: now })

  // Idempotent reuse: an already-open payment for the same plan+interval+kind
  // is re-linked instead of creating a duplicate charge attempt. A payment
  // whose provider call previously failed retries with the SAME reference so
  // Nylon Pay replays it instead of creating a second transaction (spec:
  // "Retrying a network failure MUST reuse the same reference").
  const openPayment = await db.saaSPayment.findFirst({
    where: { organizationId: organization.id, planId: plan.id, kind, billingInterval: interval, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: 'desc' },
  })
  const reference = openPayment?.reference ?? randomUUID()
  const reused = Boolean(openPayment)

  const customer = await resolveCustomerEmail(organization.id)
  const description = `NIWMS ${plan.name} plan — ${interval} billing${kind === 'renewal' ? ' (renewal)' : ''}`

  let payment = openPayment ?? await db.saaSPayment.create({
    data: {
      organizationId: organization.id,
      planId: plan.id,
      provider: PAYMENT_PROVIDER,
      reference,
      kind,
      status: 'pending',
      billingInterval: interval,
      amountUgx: quote.total,
      currency: 'UGX',
      description,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      periodStart: new Date(quote.periodStart),
      periodEnd: new Date(quote.periodEnd),
      initiatedByUserId: input.userId,
    },
  })

  // Ask Nylon Pay for a hosted invoice. On failure the payment row stays
  // pending with the same reference — the checkout can be retried, the
  // reconciliation sweep will re-check the provider, and no charge is lost or
  // duplicated.
  try {
    const nylonpay = getNylonPay()
    const invoice = await nylonpay.createInvoice({
      amount: quote.total,
      currency: 'UGX',
      customerEmail: customer.email,
      customerName: customer.name,
      description,
      items: [{ name: `NIWMS ${plan.name} (${interval})`, quantity: 1, unitPrice: quote.total }],
      merchantReference: reference,
      metadata: {
        organizationId: organization.id,
        paymentId: payment.id,
        planCode: plan.code,
        interval,
        kind,
      },
      tags: ['niwms', `plan-${plan.code}`, interval],
    })
    if (!invoice.isOk) throw new PaymentServiceError(`Nylon Pay rejected the checkout: ${invoice.error}`, 502)
    payment = await db.saaSPayment.update({
      where: { id: payment.id },
      data: {
        checkoutUrl: invoice.value.paymentLink,
        providerInvoiceId: invoice.value.id,
        invoiceNumber: invoice.value.invoiceNumber,
      },
    })
    await auditOrganization(organization.id, input.userId, 'PAYMENT_INITIATED', {
      paymentId: payment.id,
      reference,
      provider: PAYMENT_PROVIDER,
      kind,
      interval,
      amountUgx: quote.total,
      reused,
    }, 'SaaSPayment', payment.id)
  } catch (error) {
    if (error instanceof PaymentServiceError) throw error
    const message = error instanceof Error ? error.message : 'Provider request failed'
    await db.saaSPayment.update({
      where: { id: payment.id },
      data: { status: 'pending', statusChangedAt: new Date() },
    })
    await auditOrganization(organization.id, input.userId, 'PAYMENT_PROVIDER_ERROR', { paymentId: payment.id, reference, message }, 'SaaSPayment', payment.id)
    throw new PaymentServiceError(`Unable to reach Nylon Pay right now: ${message}`, 502)
  }

  return { payment: toPaymentView(payment, plan.name), reused, quote }
}

// ---------------------------------------------------------------------------
// Provider → NIWMS synchronization (webhooks + verification + reconciliation)
// ---------------------------------------------------------------------------

export interface ProviderSnapshot {
  status: PaymentStatus
  providerTransactionId?: string | null
  mode?: string | null
  failureReason?: string | null
  failureCode?: string | null
  /** Wire amount as reported by the provider (decimal string or number). */
  amount?: string | number | null
  currency?: string | null
  operatorTid?: string | null
}

type PaymentRecord = NonNullable<Awaited<ReturnType<typeof db.saaSPayment.findUnique>>>

/**
 * Apply a verified provider snapshot to a payment row. Terminal states never
 * regress. Amount/currency mismatches are security rejections: the snapshot is
 * refused and the payment keeps its canonical amount (audited by the caller).
 */
export async function applyProviderSnapshot(payment: PaymentRecord, snapshot: ProviderSnapshot, actorUserId: string | null): Promise<PaymentRecord> {
  const nextStatus = normalizeProviderStatus(snapshot.status)

  // Security validation FIRST — even a late webhook for an already-terminal
  // payment must never silently pass with wrong money attached.
  if (snapshot.amount != null) {
    const wireAmount = typeof snapshot.amount === 'string' ? Number.parseFloat(snapshot.amount) : snapshot.amount
    if (!Number.isFinite(wireAmount) || Math.round(wireAmount) !== payment.amountUgx) {
      await auditOrganization(payment.organizationId, actorUserId, 'PAYMENT_AMOUNT_MISMATCH', {
        paymentId: payment.id,
        reference: payment.reference,
        wireAmount: snapshot.amount,
        expectedUgx: payment.amountUgx,
      }, 'SaaSPayment', payment.id)
      throw new PaymentServiceError('Provider amount does not match the NIWMS payment record', 409)
    }
  }
  if (snapshot.currency && snapshot.currency.toUpperCase() !== payment.currency.toUpperCase()) {
    await auditOrganization(payment.organizationId, actorUserId, 'PAYMENT_CURRENCY_MISMATCH', {
      paymentId: payment.id,
      reference: payment.reference,
      wireCurrency: snapshot.currency,
      expected: payment.currency,
    }, 'SaaSPayment', payment.id)
    throw new PaymentServiceError('Provider currency does not match the NIWMS payment record', 409)
  }

  if (isTerminalProviderStatus(payment.status)) {
    return payment // already final — webhooks may arrive after a verified poll
  }

  const terminal = isTerminalProviderStatus(nextStatus)
  const changed = nextStatus !== payment.status || Boolean(snapshot.providerTransactionId && !payment.providerTransactionId)
  if (!changed && !terminal) return payment

  const updated = await db.saaSPayment.update({
    where: { id: payment.id },
    data: {
      status: nextStatus,
      providerTransactionId: snapshot.providerTransactionId ?? payment.providerTransactionId,
      mode: snapshot.mode ?? payment.mode,
      failureReason: nextStatus === 'failed' || nextStatus === 'cancelled' ? (snapshot.failureReason ?? payment.failureReason) : payment.failureReason,
      failureCode: nextStatus === 'failed' || nextStatus === 'cancelled' ? (snapshot.failureCode ?? payment.failureCode) : payment.failureCode,
      statusChangedAt: new Date(),
      completedAt: terminal ? new Date() : payment.completedAt,
    },
  })

  if (nextStatus === 'successful') {
    await applySuccessfulPayment(updated)
    await auditOrganization(payment.organizationId, actorUserId, 'PAYMENT_SUCCEEDED', {
      paymentId: updated.id,
      reference: updated.reference,
      providerTransactionId: updated.providerTransactionId,
      operatorTid: snapshot.operatorTid ?? null,
      amountUgx: updated.amountUgx,
      kind: updated.kind,
    }, 'SaaSPayment', updated.id)
  } else if (nextStatus === 'failed') {
    await auditOrganization(payment.organizationId, actorUserId, 'PAYMENT_FAILED', {
      paymentId: updated.id,
      reference: updated.reference,
      failureReason: updated.failureReason,
      failureCode: updated.failureCode,
      kind: updated.kind,
    }, 'SaaSPayment', updated.id)
    if (updated.kind === 'renewal') {
      await auditOrganization(payment.organizationId, actorUserId, 'SUBSCRIPTION_PAYMENT_FAILED', { paymentId: updated.id, reference: updated.reference }, 'SaaSSubscription')
    }
  } else if (nextStatus === 'cancelled') {
    await auditOrganization(payment.organizationId, actorUserId, 'PAYMENT_CANCELLED', { paymentId: updated.id, reference: updated.reference, kind: updated.kind }, 'SaaSPayment', updated.id)
  } else {
    await auditOrganization(payment.organizationId, actorUserId, 'PAYMENT_PROCESSING', { paymentId: updated.id, reference: updated.reference, status: nextStatus }, 'SaaSPayment', updated.id)
  }
  return updated
}

/**
 * Feed a successful payment into the EXISTING lifecycle engine's rules:
 * successful initial payment → ACTIVE, successful renewal → fresh ACTIVE
 * period. Exempt organizations are guarded (they never require payment).
 */
async function applySuccessfulPayment(payment: PaymentRecord): Promise<void> {
  await db.$transaction(async (tx) => {
    const organization = await tx.saaSOrganization.findUnique({ where: { id: payment.organizationId }, select: { id: true, status: true, billingMode: true, graceEndsAt: true, trialEndsAt: true } })
    if (!organization || organization.billingMode === 'exempt') return

    const periodStart = payment.periodStart ?? new Date()
    const months = payment.billingInterval === 'annual' ? 12 : payment.billingInterval === 'quarterly' ? 3 : 1
    const periodEnd = payment.periodEnd ?? addCalendarMonths(periodStart, months)

    await tx.saaSSubscription.update({
      where: { organizationId: payment.organizationId },
      data: {
        status: 'active',
        provider: PAYMENT_PROVIDER,
        billingInterval: payment.billingInterval,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
      },
    })

    if (organization.status === 'trial' || organization.status === 'grace') {
      await tx.saaSOrganization.update({
        where: { id: payment.organizationId },
        data: { status: 'active', graceEndsAt: null },
      })
    }
  })

  await auditOrganization(payment.organizationId, payment.initiatedByUserId, payment.kind === 'renewal' ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_ACTIVATED', {
    paymentId: payment.id,
    reference: payment.reference,
    interval: payment.billingInterval,
    amountUgx: payment.amountUgx,
    periodStart: payment.periodStart?.toISOString() ?? null,
    periodEnd: payment.periodEnd?.toISOString() ?? null,
  }, 'SaaSSubscription')
}

/**
 * Server-side verification for one payment. Uses the provider as the source
 * of truth for payment state (the browser redirect is NEVER the authority).
 */
export async function syncPaymentFromProvider(payment: PaymentRecord, actorUserId: string | null): Promise<PaymentRecord> {
  if (isTerminalProviderStatus(payment.status)) return payment
  const nylonpay = getNylonPay()
  const result = await nylonpay.getTransaction({ reference: payment.reference })
  if (!result.isOk) {
    // Unknown reference at the provider usually means the hosted invoice was
    // never opened — not an error; leave pending for the reconciliation sweep.
    await auditOrganization(payment.organizationId, actorUserId, 'PAYMENT_VERIFIED', {
      paymentId: payment.id,
      reference: payment.reference,
      outcome: 'provider_lookup_failed',
      message: result.error,
    }, 'SaaSPayment', payment.id)
    return payment
  }
  return applyProviderSnapshot(payment, {
    status: normalizeProviderStatus(result.value.status),
    providerTransactionId: result.value.id,
    mode: result.value.mode ?? null,
    failureReason: result.value.failureReason,
    // failureCode/operatorTid are in spec v2.4.0 but the SDK 2.0.1 types lag —
    // read them defensively so a newer backend does not break us.
    failureCode: (result.value as unknown as { failureCode?: string | null }).failureCode ?? null,
    amount: result.value.amount,
    currency: result.value.currency,
    operatorTid: (result.value as unknown as { operatorTid?: string | null }).operatorTid ?? null,
  }, actorUserId)
}

/** Re-check payments that have sat open for >5 minutes (cron-driven). */
export async function reconcilePendingPayments(): Promise<{ checked: number; resolved: number; errors: number }> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000)
  const stale = await db.saaSPayment.findMany({
    where: { status: { in: OPEN_STATUSES }, statusChangedAt: { lt: cutoff } },
    take: 50,
    orderBy: { statusChangedAt: 'asc' },
  })
  let resolved = 0
  let errors = 0
  for (const payment of stale) {
    try {
      const before = payment.status
      const after = await syncPaymentFromProvider(payment, null)
      if (after.status !== before) resolved += 1
    } catch {
      errors += 1
    }
  }
  return { checked: stale.length, resolved, errors }
}

/**
 * NIWMS-driven renewals. Nylon Pay's current API (spec v2.4.0) has no
 * subscription/payment-plans resource, so recurring billing is implemented as
 * a per-period hosted invoice for active subscriptions whose paid period ends
 * within 3 days — the honest, provider-supported mechanism (documented, not a
 * pretend provider-side subscription).
 */
export async function createDueRenewals(): Promise<{ created: number; skipped: number }> {
  const horizon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const subscriptions = await db.saaSSubscription.findMany({
    where: { status: 'active', currentPeriodEnd: { lte: horizon } },
    include: { plan: true, organization: { select: { id: true, billingMode: true, status: true } } },
    take: 50,
    orderBy: { currentPeriodEnd: 'asc' },
  })
  let created = 0
  let skipped = 0
  for (const subscription of subscriptions) {
    if (subscription.organization.billingMode === 'exempt') { skipped += 1; continue }
    if (subscription.plan.monthlyPriceCents <= 0) { skipped += 1; continue }
    const openRenewal = await db.saaSPayment.findFirst({
      where: {
        organizationId: subscription.organizationId,
        kind: 'renewal',
        status: { in: OPEN_STATUSES },
      },
    })
    if (openRenewal) { skipped += 1; continue }
    const periodEnd = subscription.currentPeriodEnd
    if (!periodEnd) { skipped += 1; continue }
    const paidThrough = await db.saaSPayment.findFirst({
      where: { organizationId: subscription.organizationId, status: 'successful', periodEnd: { gte: periodEnd } },
    })
    if (paidThrough) { skipped += 1; continue }
    try {
      await startCheckout({
        organizationId: subscription.organizationId,
        userId: null,
        interval: (INTERVALS as string[]).includes(subscription.billingInterval) ? (subscription.billingInterval as BillingInterval) : 'monthly',
        kind: 'renewal',
      })
      created += 1
    } catch {
      skipped += 1
    }
  }
  return { created, skipped }
}

// ---------------------------------------------------------------------------
// Webhook processing (signature already verified by the route)
// ---------------------------------------------------------------------------

export interface NylonWebhookBody {
  delivery_id?: string
  event?: string
  timestamp?: string
  payload?: {
    transactionId?: string
    reference?: string
    amount?: string | null
    currency?: string | null
    status?: string
    previousStatus?: string
    type?: string | null
    method?: string | null
    mode?: string | null
    failureReason?: string | null
    failureCode?: string | null
    operatorTid?: string | null
  }
}

export type WebhookOutcome =
  | { result: 'duplicate' }
  | { result: 'ignored'; reason: string }
  | { result: 'rejected'; reason: string }
  | { result: 'processed'; paymentId: string; status: PaymentStatus }

/**
 * Process one verified webhook delivery. Idempotency is enforced at the
 * DATABASE level: SaaSBillingEvent has @@unique([provider, providerEventId])
 * and the delivery id is recorded inside the same transaction that applies the
 * state change — the same webhook delivered 2, 5, or 20 times results in one
 * logical payment transition.
 */
export async function processNylonWebhookDelivery(body: NylonWebhookBody): Promise<WebhookOutcome> {
  const deliveryId = typeof body.delivery_id === 'string' ? body.delivery_id : null
  const eventType = typeof body.event === 'string' ? body.event : null
  const payload = body.payload ?? {}
  const reference = typeof payload.reference === 'string' ? payload.reference : null

  if (!deliveryId || !eventType || !reference) {
    return { result: 'ignored', reason: 'missing delivery_id, event, or reference' }
  }

  // Reserve the delivery id first: concurrent duplicates lose this race and
  // short-circuit below, guaranteeing a single logical transition.
  try {
    await db.saaSBillingEvent.create({
      data: {
        provider: PAYMENT_PROVIDER,
        providerEventId: deliveryId,
        eventType,
        payload: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    })
  } catch {
    return { result: 'duplicate' }
  }

  const payment = await db.saaSPayment.findUnique({
    where: { reference },
    include: { organization: { select: { id: true } } },
  })
  if (!payment) {
    await auditOrganization(null, null, 'WEBHOOK_UNKNOWN_REFERENCE', { deliveryId, eventType, reference }, 'SaaSPayment')
    return { result: 'ignored', reason: 'unknown reference' }
  }

  const existingOrgAudit = await db.saaSAuditLog.count({ where: { organizationId: payment.organizationId, action: 'WEBHOOK_RECEIVED' } })
  if (existingOrgAudit === 0) {
    await auditOrganization(payment.organizationId, null, 'WEBHOOK_RECEIVED', { deliveryId, eventType }, 'SaaSPayment')
  }

  try {
    const updated = await applyProviderSnapshot(payment, {
      status: normalizeProviderStatus(payload.status),
      providerTransactionId: payload.transactionId ?? null,
      mode: payload.mode ?? null,
      failureReason: payload.failureReason ?? null,
      failureCode: payload.failureCode ?? null,
      amount: payload.amount ?? null,
      currency: payload.currency ?? null,
      operatorTid: payload.operatorTid ?? null,
    }, null)
    return { result: 'processed', paymentId: updated.id, status: normalizeProviderStatus(updated.status) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'snapshot rejected'
    await auditOrganization(payment.organizationId, null, 'WEBHOOK_REJECTED', { deliveryId, eventType, reference, reason }, 'SaaSPayment')
    return { result: 'rejected', reason }
  }
}
