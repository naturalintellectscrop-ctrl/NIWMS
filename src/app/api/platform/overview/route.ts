import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/auth'

// Platform Control Center feed: organization health, income, and time frames.
//
// Income metrics are engine-truthful:
//  - estimatedMrrCents normalizes every active paid subscription to a monthly
//    figure using the same interval discounts the billing engine sells with
//    (monthly ×1, quarterly ×0.95, annual ×0.90 of the plan's monthly price).
//  - No invented "collected revenue" numbers: payments exist as billing events,
//    so we report their count instead of fabricating an amount.

const DAY_MS = 24 * 60 * 60 * 1000
const INTERVAL_FACTOR: Record<string, number> = { monthly: 1, quarterly: 0.95, annual: 0.9 }

export async function GET(request: NextRequest) {
  const payload = await authenticateRequest(request)
  if (!payload) return unauthorizedResponse()
  if (payload.role !== 'super_admin') return forbiddenResponse('Natural Intellects platform administrator access required')

  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * DAY_MS)

  const [organizations, employees, reports, trialRequests, billingEvents] = await Promise.all([
    db.saaSOrganization.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, slug: true, status: true, organizationType: true,
        createdAt: true, trialEndsAt: true, graceEndsAt: true, bannedAt: true, bannedReason: true,
        memberships: { where: { status: 'active' }, select: { id: true } },
        subscriptions: {
          select: {
            status: true, billingInterval: true, currentPeriodStart: true, currentPeriodEnd: true,
            plan: { select: { name: true, monthlyPriceCents: true } },
          },
        },
      },
    }),
    db.saaSOrganizationMembership.count({ where: { status: 'active' } }),
    db.reportingDailyReport.count(),
    db.trialRequest.count({ where: { status: 'pending' } }),
    db.saaSBillingEvent.count(),
  ])

  let estimatedMrrCents = 0
  let paidClients = 0
  let customPricedClients = 0
  let upcomingRenewals = 0
  const byStatus: Record<string, number> = {}
  for (const organization of organizations) {
    byStatus[organization.status] = (byStatus[organization.status] ?? 0) + 1
    const subscription = organization.subscriptions[0]
    if (subscription && subscription.status === 'active' && organization.status === 'active') {
      paidClients += 1
      const factor = INTERVAL_FACTOR[subscription.billingInterval] ?? 1
      estimatedMrrCents += Math.round((subscription.plan?.monthlyPriceCents ?? 0) * factor)
      if ((subscription.plan?.monthlyPriceCents ?? 0) === 0) customPricedClients += 1
      if (subscription.currentPeriodEnd && subscription.currentPeriodEnd <= in30Days) upcomingRenewals += 1
    }
  }

  return NextResponse.json({
    metrics: {
      organizations: organizations.length,
      activeOrganizations: (byStatus['active'] ?? 0) + (byStatus['trial'] ?? 0) + (byStatus['grace'] ?? 0),
      paidClients,
      trials: (byStatus['trial'] ?? 0) + (byStatus['grace'] ?? 0),
      paused: byStatus['grace'] ?? 0,
      suspended: byStatus['suspended'] ?? 0,
      banned: byStatus['banned'] ?? 0,
      estimatedMrrCents,
      customPricedClients,
      upcomingRenewals,
      employees,
      reports,
      pendingTrialRequests: trialRequests,
      billingEvents,
    },
    gracePeriodDays: 30,
    organizations: organizations.map((organization) => {
      const subscription = organization.subscriptions[0] ?? null
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        organizationType: organization.organizationType,
        createdAt: organization.createdAt,
        trialEndsAt: organization.trialEndsAt,
        graceEndsAt: organization.graceEndsAt,
        bannedAt: organization.bannedAt,
        bannedReason: organization.bannedReason,
        memberCount: organization.memberships.length,
        subscription: subscription
          ? {
              status: subscription.status,
              billingInterval: subscription.billingInterval,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              planName: subscription.plan?.name ?? null,
              monthlyPriceCents: subscription.plan?.monthlyPriceCents ?? 0,
            }
          : null,
      }
    }),
  })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
