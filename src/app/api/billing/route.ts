import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireTenant, requireOrganizationAdmin } from '@/lib/tenant'
import { computeQuote, type BillingInterval } from '@/lib/billing/pricing'
import { checkRateLimit } from '@/lib/rate-limiter'
import { PaymentServiceError, startCheckout, toPaymentView } from '@/lib/payments/service'

const BILLING_INTERVAL_VALUES: BillingInterval[] = ['monthly', 'quarterly', 'annual']

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  const { context, response } = await requireTenant(auth)
  if (!context) return response
  const organization = await db.saaSOrganization.findUnique({ where: { id: context.organizationId }, include: { subscriptions: { include: { plan: true } } } })
  if (!organization) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  const subscription = organization.subscriptions[0] || null
  const plan = subscription?.plan || null
  const [employeeCount] = await Promise.all([
    db.reportingEmployee.count({ where: { organizationId: organization.id, status: { not: 'archived' } } }),
  ])
  const employeeLimit = plan?.maxMembers ?? null
  const monthlyPriceUgx = plan ? plan.monthlyPriceCents / 100 : 0
  const interval = (BILLING_INTERVAL_VALUES as string[]).includes(subscription?.billingInterval ?? '')
    ? (subscription!.billingInterval as BillingInterval)
    : 'monthly'
  // Definitive numbers for the organization's current interval — the same engine
  // that powers the marketing calculator, so the workspace never disagrees with the brochure.
  const quote = computeQuote({ monthlyPrice: monthlyPriceUgx, interval })
  // Payment history — real server state from the payments table, newest first.
  const payments = await db.saaSPayment.findMany({
    where: { organizationId: organization.id },
    include: { plan: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return NextResponse.json({
    organization: { id: organization.id, status: organization.status, billingMode: organization.billingMode, trialStartedAt: organization.trialStartedAt, trialEndsAt: organization.trialEndsAt },
    subscription: subscription
      ? {
          status: subscription.status,
          provider: subscription.provider,
          billingInterval: interval,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: Boolean(subscription.canceledAt),
          trialEndsAt: subscription.trialEndsAt,
          plan: {
            key: plan?.code ?? '',
            name: plan?.name ?? 'Unassigned',
            // Stored in minor units (UGX cents); the UI presents whole UGX.
            monthlyPrice: monthlyPriceUgx,
            maxEmployees: plan?.maxMembers ?? null,
          },
          quote,
        }
      : null,
    plan,
    usage: { employeeCount, employeeLimit, canAddEmployee: employeeLimit === null || employeeCount < employeeLimit },
    payments: payments.map((p) => toPaymentView(p, p.plan.name)),
  })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  const { context, response } = await requireOrganizationAdmin(auth)
  if (!context) return response
  const body = await request.json().catch(() => null)
  if (body?.action === 'set_interval') {
    const interval = BILLING_INTERVAL_VALUES.includes(body?.interval) ? (body.interval as BillingInterval) : null
    if (!interval) return NextResponse.json({ error: 'interval must be one of monthly, quarterly, annual' }, { status: 400 })
    const subscription = await db.saaSSubscription.findUnique({ where: { organizationId: context.organizationId }, include: { plan: true } })
    if (!subscription) return NextResponse.json({ error: 'No subscription found for this organization' }, { status: 404 })
    // Interval PREFERENCE changes are a trial-stage convenience. On an active
    // (paid) subscription the interval governs real money and a new paid
    // period: it may only change through a verified Nylon Pay checkout, never
    // by silently resetting the period here.
    if (subscription.status !== 'trialing') {
      return NextResponse.json({ error: 'The billing interval on an active subscription changes through checkout — start a checkout for the interval you want.' }, { status: 409 })
    }
    const data = { billingInterval: interval }
    const updated = await db.saaSSubscription.update({ where: { id: subscription.id }, data })
    const quote = computeQuote({ monthlyPrice: subscription.plan.monthlyPriceCents / 100, interval })
    await db.saaSAuditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'BILLING_INTERVAL_CHANGED',
        resourceType: 'SaaSSubscription',
        resourceId: subscription.id,
        metadata: JSON.stringify({ interval, chargeTotalUgx: quote.total }),
      },
    })
    return NextResponse.json({ subscription: updated, quote })
  }
  if (body?.action === 'cancel') {
    const subscription = await db.saaSSubscription.findUnique({ where: { organizationId: context.organizationId } })
    if (!subscription || subscription.status !== 'active') return NextResponse.json({ error: 'Only active paid subscriptions can be cancelled' }, { status: 409 })
    const updated = await db.saaSSubscription.update({ where: { id: subscription.id }, data: { canceledAt: new Date() } })
    await db.saaSAuditLog.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action: 'SUBSCRIPTION_CANCELLED', resourceType: 'SaaSSubscription', resourceId: subscription.id, metadata: {} } })
    return NextResponse.json({ subscription: updated })
  }
  if (body?.action === 'start_checkout') {
    // Brute-force/abuse guard on a money-touching endpoint (successful attempts
    // consume quota too — a checkout initiation is a real, billable intent).
    const limit = checkRateLimit(context.userId, 'billing_checkout')
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many checkout attempts. Please try again in 15 minutes.' }, { status: 429 })
    }
    try {
      // Server authority: organization comes from the session tenant context,
      // plan + interval are validated server-side, and the amount is computed
      // by the canonical billing engine inside startCheckout. The browser
      // cannot set price, currency, organization, or payment status.
      const result = await startCheckout({
        organizationId: context.organizationId,
        userId: context.userId,
        planCode: body?.planCode,
        interval: body?.interval,
        kind: 'initial',
      })
      return NextResponse.json({ payment: result.payment, reused: result.reused, quote: result.quote })
    } catch (error) {
      if (error instanceof PaymentServiceError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Unable to start checkout right now' }, { status: 500 })
    }
  }
  return NextResponse.json({ error: 'Unknown billing action' }, { status: 400 })
}
