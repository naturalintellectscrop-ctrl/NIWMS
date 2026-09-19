import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const payload = await authenticateRequest(request)
  if (!payload) return unauthorizedResponse()
  if (payload.role !== 'super_admin') return forbiddenResponse('Natural Intellects platform administrator access required')
  const [organizations, activeOrganizations, trials, subscriptions, suspended, employees, reports, recent] = await Promise.all([
    db.saaSOrganization.count(),
    db.saaSOrganization.count({ where: { status: { in: ['trial', 'active', 'grace'] } } }),
    db.saaSOrganization.count({ where: { status: { in: ['trial', 'grace'] } } }),
    db.saaSSubscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
    db.saaSOrganization.count({ where: { status: 'suspended' } }),
    db.saaSOrganizationMembership.count({ where: { status: 'active' } }),
    db.reportingDailyReport.count(),
    db.saaSOrganization.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, name: true, slug: true, status: true, createdAt: true, trialEndsAt: true, memberships: { where: { status: 'active' }, select: { id: true } }, subscriptions: { select: { status: true, plan: { select: { name: true } } } } } }),
  ])
  return NextResponse.json({
    metrics: { organizations, activeOrganizations, trials, subscriptions, suspended, employees, reports },
    organizations: recent.map((organization) => ({ ...organization, memberCount: organization.memberships.length, _count: { users: organization.memberships.length }, subscription: organization.subscriptions[0] || null, memberships: undefined, subscriptions: undefined })),
  })
}
