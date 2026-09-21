// Time-engine verification scenarios against the local database.
// Run: bun scripts/qa-engine.ts
// Creates throwaway QA orgs, drives syncOrganizationLifecycle through the
// full lifecycle (expiry → pause → purge), asserts state transitions and
// audit/tombstone behavior, then removes everything it created.

import { db } from '@/lib/db'

const DAY = 24 * 60 * 60 * 1000
const TAG = `qa-engine-${Date.now().toString(36)}`
let failures = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  PASS ${name}`)
  } else {
    failures += 1
    console.error(`  FAIL ${name} ${detail}`)
  }
}

async function planId(): Promise<string> {
  const plan = await db.saaSPlan.findFirst({ select: { id: true } })
  if (!plan) throw new Error('No plan seeded')
  return plan.id
}

async function seedOrg(name: string, data: { status: string; trialEndsAt: Date; graceEndsAt?: Date; withSub?: { status: string; currentPeriodEnd: Date; currentPeriodStart?: Date }; withUser?: boolean; withReports?: boolean }) {
  const organization = await db.saaSOrganization.create({
    data: { name: `${name} ${TAG}`, slug: `${name}-${TAG}`, status: data.status, trialEndsAt: data.trialEndsAt, graceEndsAt: data.graceEndsAt },
  })
  if (data.withSub) {
    await db.saaSSubscription.create({
      data: {
        organizationId: organization.id,
        planId: await planId(),
        status: data.withSub.status,
        billingInterval: 'monthly',
        currentPeriodStart: data.withSub.currentPeriodStart ?? new Date(data.withSub.currentPeriodEnd.getTime() - 30 * DAY),
        currentPeriodEnd: data.withSub.currentPeriodEnd,
      },
    })
  }
  if (data.withUser) {
    const user = await db.user.create({ data: { username: `${name}-${TAG}@qa.test`, passwordHash: 'x', role: 'admin' } })
    await db.saaSOrganizationMembership.create({ data: { organizationId: organization.id, userId: user.id, role: 'owner' } })
    if (data.withReports) {
      const department = await db.reportingDepartment.create({ data: { organizationId: organization.id, name: 'QA Dept', code: 'QAD' } })
      const position = await db.reportingPosition.create({ data: { organizationId: organization.id, departmentId: department.id, name: 'QA Officer', code: 'QAP' } })
      const employee = await db.reportingEmployee.create({ data: { organizationId: organization.id, positionId: position.id, membershipId: (await db.saaSOrganizationMembership.findFirst({ where: { organizationId: organization.id, userId: user.id } }))!.id, displayName: 'QA Employee', employeeCode: 'QAE-1' } })
      await db.reportingDailyReport.create({ data: { organizationId: organization.id, employeeId: employee.id, reportDate: new Date().toISOString().slice(0, 10), activityText: 'QA activity' } })
    }
    return { organization, userId: user.id }
  }
  return { organization, userId: null as string | null }
}

async function cleanup(orgIds: string[], userIds: string[]) {
  for (const id of orgIds) {
    await db.saaSOrganization.delete({ where: { id } }).catch(() => undefined)
    await db.auditEvent.deleteMany({ where: { organizationId: id } })
  }
  for (const id of userIds) {
    await db.user.delete({ where: { id } }).catch(() => undefined)
  }
}

async function main() {
  console.log(`Time-engine scenarios (${TAG})`)
  let orgIds: string[] = []
  const userIds: string[] = []
  const now = Date.now()

  try {
    // ── Scenario 1: paid subscription expiry → pause into grace ──
    console.log('1. Subscription expiry pauses the client')
    const { organization: subOrg } = await seedOrg('qa-sub', {
      status: 'active',
      trialEndsAt: new Date(now - 60 * DAY),
      withSub: { status: 'active', currentPeriodEnd: new Date(now - 3 * DAY) },
    })
    orgIds.push(subOrg.id)
    const { syncOrganizationLifecycle } = await import('@/lib/lifecycle')
    const r1 = await syncOrganizationLifecycle(subOrg.id)
    const after1 = await db.saaSOrganization.findUnique({ where: { id: subOrg.id }, include: { subscriptions: true } })
    check('status → grace', r1.action === 'subscription_expired' && after1?.status === 'grace')
    check('grace window = period end + 30d', Math.abs((after1!.graceEndsAt?.getTime() ?? 0) - (now - 3 * DAY + 30 * DAY)) < 5000)
    check('subscription marked expired', after1?.subscriptions[0]?.status === 'expired')
    check('audit SUBSCRIPTION_EXPIRED', (await db.saaSAuditLog.count({ where: { organizationId: subOrg.id, action: 'SUBSCRIPTION_EXPIRED' } })) === 1)

    // ── Scenario 2: trial expiry → grace, then idempotent re-run ──
    console.log('2. Trial expiry pauses the client; re-run is a no-op')
    const { organization: trialOrg } = await seedOrg('qa-trial', { status: 'trial', trialEndsAt: new Date(now - 2 * DAY) })
    orgIds.push(trialOrg.id)
    const r2 = await syncOrganizationLifecycle(trialOrg.id)
    const after2 = await db.saaSOrganization.findUnique({ where: { id: trialOrg.id } })
    check('status → grace', r2.action === 'grace_started' && after2?.status === 'grace')
    check('grace window = trial end + 30d', Math.abs((after2!.graceEndsAt?.getTime() ?? 0) - (now - 2 * DAY + 30 * DAY)) < 5000)
    const r2b = await syncOrganizationLifecycle(trialOrg.id)
    check('second run no-op', r2b.action === 'none')
    check('no duplicate audit', (await db.saaSAuditLog.count({ where: { organizationId: trialOrg.id, action: 'GRACE_STARTED' } })) === 1)

    // ── Scenario 3: grace over → full data purge ──
    console.log('3. Grace over purges the client and all data')
    const { organization: purgeOrg, userId: purgeUserId } = await seedOrg('qa-purge', {
      status: 'grace',
      trialEndsAt: new Date(now - 45 * DAY),
      graceEndsAt: new Date(now - 1 * DAY),
      withSub: { status: 'expired', currentPeriodEnd: new Date(now - 31 * DAY) },
      withUser: true,
      withReports: true,
    })
    orgIds.push(purgeOrg.id)
    if (purgeUserId) userIds.push(purgeUserId)
    const r3 = await syncOrganizationLifecycle(purgeOrg.id)
    check('result = purged', r3.action === 'organization_purged')
    check('organization row gone', (await db.saaSOrganization.findUnique({ where: { id: purgeOrg.id } })) === null)
    check('subscription gone', (await db.saaSSubscription.count({ where: { organizationId: purgeOrg.id } })) === 0)
    check('memberships gone', (await db.saaSOrganizationMembership.count({ where: { organizationId: purgeOrg.id } })) === 0)
    check('daily reports gone', (await db.reportingDailyReport.count({ where: { organizationId: purgeOrg.id } })) === 0)
    check('departments gone', (await db.reportingDepartment.count({ where: { organizationId: purgeOrg.id } })) === 0)
    check('orphan user deleted', (await db.user.findUnique({ where: { id: purgeUserId! } })) === null)
    check('org audit logs gone', (await db.saaSAuditLog.count({ where: { organizationId: purgeOrg.id } })) === 0)
    const tombstone = await db.auditEvent.findFirst({ where: { entityId: purgeOrg.id, action: 'ORGANIZATION_PURGED' } })
    check('tombstone audit survives', tombstone !== null && JSON.parse(tombstone.metadata ?? '{}').slug === `qa-purge-${TAG}`)
    orgIds = orgIds.filter((id) => id !== purgeOrg.id)

    // ── Scenario 4: banned org is engine-immune ──
    console.log('4. Banned org is skipped by the engine')
    const { organization: bannedOrg } = await seedOrg('qa-banned', { status: 'banned', trialEndsAt: new Date(now - 90 * DAY) })
    orgIds.push(bannedOrg.id)
    const r4 = await syncOrganizationLifecycle(bannedOrg.id)
    const after4 = await db.saaSOrganization.findUnique({ where: { id: bannedOrg.id } })
    check('still banned, untouched', r4.action === 'none' && after4?.status === 'banned')

    // ── Scenario 5: active paid client is untouched ──
    console.log('5. Active paid client untouched')
    const { organization: activeOrg } = await seedOrg('qa-active', {
      status: 'active',
      trialEndsAt: new Date(now - 60 * DAY),
      withSub: { status: 'active', currentPeriodEnd: new Date(now + 20 * DAY) },
    })
    orgIds.push(activeOrg.id)
    const r5 = await syncOrganizationLifecycle(activeOrg.id)
    check('no action', r5.action === 'none' && r5.status === 'active')
  } finally {
    await cleanup(orgIds, userIds)
    console.log('Cleanup done.')
  }

  if (failures > 0) {
    console.error(`${failures} check(s) FAILED`)
    process.exit(1)
  }
  console.log('All engine scenarios passed.')
  process.exit(0)
}

void main()
