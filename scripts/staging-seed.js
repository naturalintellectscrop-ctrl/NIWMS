/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require('bcryptjs')

if (!process.env.STAGING_DATABASE_URL || process.env.STAGING_CONFIRM !== 'true') {
  throw new Error('Refusing staging seed: set STAGING_DATABASE_URL and STAGING_CONFIRM=true. Production DATABASE_URL is never accepted.')
}

process.env.DATABASE_URL = process.env.STAGING_DATABASE_URL
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const password = process.env.STAGING_SEED_PASSWORD
if (!password) throw new Error('STAGING_SEED_PASSWORD must be configured')

async function createTenant({ name, slug, adminUsername, employeePrefix }) {
  const plan = await prisma.plan.upsert({ where: { key: 'starter' }, update: {}, create: { key: 'starter', name: 'Starter', monthlyPrice: 0, entitlements: JSON.stringify({ reports: true }) } })
  const admin = await prisma.user.upsert({ where: { username: adminUsername }, update: { passwordHash: await bcrypt.hash(password, 12), role: 'admin', status: 'active' }, create: { username: adminUsername, passwordHash: await bcrypt.hash(password, 12), role: 'admin', status: 'active' } })
  const organization = await prisma.organization.upsert({ where: { slug }, update: {}, create: { name, slug, timezone: 'Africa/Kampala', trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 14 * 86400000) } })
  await prisma.user.update({ where: { id: admin.id }, data: { organizationId: organization.id } })
  await prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId: organization.id, userId: admin.id } }, update: { role: 'owner', status: 'active' }, create: { organizationId: organization.id, userId: admin.id, role: 'owner' } })
  await prisma.organizationSettings.upsert({ where: { organizationId: organization.id }, update: {}, create: { organizationId: organization.id } })
  await prisma.subscription.upsert({ where: { organizationId: organization.id }, update: {}, create: { organizationId: organization.id, planId: plan.id, status: 'trialing' } })
  const canonicalPlan = await prisma.saaSPlan.upsert({ where: { code: 'starter' }, update: {}, create: { code: 'starter', name: 'Starter', features: { reports: true } } })
  const canonicalOrganization = await prisma.saaSOrganization.upsert({ where: { slug }, update: { name }, create: { name, slug } })
  await prisma.saaSSubscription.upsert({ where: { organizationId: canonicalOrganization.id }, update: {}, create: { organizationId: canonicalOrganization.id, planId: canonicalPlan.id, status: 'trialing' } })
  const canonicalAdminMembership = await prisma.saaSOrganizationMembership.upsert({ where: { organizationId_userId: { organizationId: canonicalOrganization.id, userId: admin.id } }, update: { role: 'owner', status: 'active' }, create: { organizationId: canonicalOrganization.id, userId: admin.id, role: 'owner' } })
  await prisma.reportingEmployee.upsert({ where: { membershipId: canonicalAdminMembership.id }, update: {}, create: { organizationId: canonicalOrganization.id, membershipId: canonicalAdminMembership.id, employeeCode: `${employeePrefix.toUpperCase()}-ADMIN`, displayName: admin.username } })

  for (let index = 1; index <= 3; index += 1) {
    const username = `${employeePrefix}${index}@staging.invalid`
    const employee = await prisma.user.upsert({ where: { username }, update: {}, create: { username, passwordHash: await bcrypt.hash(password, 12), role: 'employee', organizationId: organization.id, status: 'active' } })
    await prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId: organization.id, userId: employee.id } }, update: {}, create: { organizationId: organization.id, userId: employee.id, role: 'member', status: 'active' } })
    await prisma.employeeProfile.upsert({ where: { userId: employee.id }, update: {}, create: { userId: employee.id, employeeId: `${employeePrefix.toUpperCase()}-${String(index).padStart(3, '0')}`, position: 'Analyst' } })
    await prisma.dailyReport.upsert({ where: { userId_date: { userId: employee.id, date: '2026-09-07' } }, update: {}, create: { userId: employee.id, date: '2026-09-07', activityText: 'Synthetic staging report for tenant-isolation testing.' } })
    const canonicalMembership = await prisma.saaSOrganizationMembership.upsert({ where: { organizationId_userId: { organizationId: canonicalOrganization.id, userId: employee.id } }, update: {}, create: { organizationId: canonicalOrganization.id, userId: employee.id, role: 'member', status: 'active' } })
    const reportingEmployee = await prisma.reportingEmployee.upsert({ where: { membershipId: canonicalMembership.id }, update: {}, create: { organizationId: canonicalOrganization.id, membershipId: canonicalMembership.id, employeeCode: `${employeePrefix.toUpperCase()}-${String(index).padStart(3, '0')}`, displayName: username } })
    await prisma.reportingDailyReport.upsert({ where: { employeeId_reportDate: { employeeId: reportingEmployee.id, reportDate: '2026-09-07' } }, update: {}, create: { organizationId: canonicalOrganization.id, employeeId: reportingEmployee.id, reportDate: '2026-09-07', activityText: 'Synthetic canonical reporting fixture.' } })
  }
}

async function main() {
  const platformAdmin = await prisma.user.upsert({ where: { username: 'superadmin@staging.invalid' }, update: { role: 'super_admin', status: 'active' }, create: { username: 'superadmin@staging.invalid', passwordHash: await bcrypt.hash(password, 12), role: 'super_admin', status: 'active' } })
  await createTenant({ name: 'Acme Technologies', slug: 'acme-staging', adminUsername: 'admin@acme.staging.invalid', employeePrefix: 'acme' })
  await createTenant({ name: 'Bluewave Services', slug: 'bluewave-staging', adminUsername: 'admin@bluewave.staging.invalid', employeePrefix: 'bluewave' })
  console.log(`Seeded staging accounts with platform admin ${platformAdmin.username}`)
}

main().catch((error) => { console.error(error.message); process.exitCode = 1 }).finally(() => prisma.$disconnect())
