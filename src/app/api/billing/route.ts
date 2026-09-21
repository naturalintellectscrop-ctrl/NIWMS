import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireTenant, requireOrganizationAdmin } from '@/lib/tenant'
import { addCalendarMonths, computeQuote, type BillingInterval } from '@/lib/billing/pricing'

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
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return NextResponse.json({ error: 'Billing interval can only be changed on active or trialing subscriptions' }, { status: 409 })
    }
    const now = new Date()
    // On an active subscription the new interval starts a fresh period today;
    // while trialing it only sets the preference that will govern the first charge.
    const data = subscription.status === 'active'
      ? {
          billingInterval: interval,
          currentPeriodStart: now,
          currentPeriodEnd: addCalendarMonths(now, interval === 'annual' ? 12 : interval === 'quarterly' ? 3 : 1),
          canceledAt: null,
        }
      : { billingInterval: interval }
    const updated = await db.saaSSubscription.update({ where: { id: subscription.id }, data })
    const quote = computeQuote({ monthlyPrice: subscription.plan.monthlyPriceCents / 100, interval, startsAt: now })
    await db.saaSAuditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'BILLING_INTERVAL_CHANGED',
        resourceType: 'SaaSSubscription',
        resourceId: subscription.id,
        metadata: JSON.stringify({ interval, chargeTotalUgx: quote.total, periodEnd: quote.periodEnd }),
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
  return NextResponse.json({ error: 'Billing provider checkout is not configured for this deployment' }, { status: 503 })
}
