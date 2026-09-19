import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireTenant } from '@/lib/tenant'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  const { context, response } = await requireTenant(auth)
  if (!context) return response
  const organization = await db.saaSOrganization.findUnique({ where: { id: context.organizationId }, include: { subscriptions: { include: { plan: true } } } })
  if (!organization) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  const [employeeCount, reportCount] = await Promise.all([
    db.reportingEmployee.count({ where: { organizationId: organization.id, status: { not: 'archived' } } }),
    db.reportingDailyReport.count({ where: { organizationId: organization.id } }),
  ])
  const subscription = organization.subscriptions[0] || null
  const maxMembers = subscription?.plan.maxMembers ?? null
  return NextResponse.json({
    organization: { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status, trialStartedAt: organization.trialStartedAt, trialEndsAt: organization.trialEndsAt },
    plan: subscription?.plan || null,
    subscription,
    entitlements: { maxMembers, maxReportsPerMonth: subscription?.plan.maxReportsPerMonth ?? null },
    usage: { employeeCount, reportCount, canAddEmployee: maxMembers === null || employeeCount < maxMembers },
  })
}
