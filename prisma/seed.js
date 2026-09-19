/* eslint-disable @typescript-eslint/no-require-imports */
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const syntheticOrganizations = [
  { name: 'Synthetic Organization A', slug: 'synthetic-org-a', planCode: 'starter' },
  { name: 'Synthetic Organization B', slug: 'synthetic-org-b', planCode: 'business' },
];

async function seed() {
  const prisma = new PrismaClient();
  const seedPassword = process.env.ADMIN_SEED_PASSWORD;

  if (!seedPassword) {
    throw new Error('ADMIN_SEED_PASSWORD must be configured to seed the platform administrator');
  }

  try {
    const passwordHash = await bcrypt.hash(seedPassword, 12);
    const admin = await prisma.user.upsert({
      where: { username: 'admin@niltd.com' },
      update: { passwordHash, role: 'super_admin', status: 'active', organizationId: null },
      create: { username: 'admin@niltd.com', passwordHash, role: 'super_admin', status: 'active' },
    });

    const plans = [
      ['starter', 'Starter', 3000000, 10],
      ['business', 'Business', 7500000, 30],
      ['professional', 'Professional', 15000000, 75],
      ['enterprise', 'Enterprise', 0, null],
    ];
    const planMap = new Map();
    for (const [code, name, monthlyPriceCents, maxMembers] of plans) {
      // Annual anchor follows the billing engine's 10% interval discount
      // (0.9 × 12 = 10.8 × monthly). Stored so DB-driven surfaces agree with the calculator.
      const annualPriceCents = monthlyPriceCents === 0 ? 0 : Math.round(monthlyPriceCents * 10.8);
      const plan = await prisma.saaSPlan.upsert({
        where: { code },
        update: { name, monthlyPriceCents, annualPriceCents, maxMembers, isActive: true },
        create: { code, name, monthlyPriceCents, annualPriceCents, maxMembers, features: { reporting: true } },
      });
      planMap.set(code, plan);
    }

    for (const fixture of syntheticOrganizations) {
      // trialEndsAt is set explicitly so seeding works on providers without
      // database-level defaults (e.g. SQLite local development).
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const organization = await prisma.saaSOrganization.upsert({
        where: { slug: fixture.slug },
        update: { name: fixture.name, status: 'trial' },
        create: { name: fixture.name, slug: fixture.slug, status: 'trial', trialEndsAt },
      });
      const plan = planMap.get(fixture.planCode);
      await prisma.saaSSubscription.upsert({
        where: { organizationId: organization.id },
        update: { planId: plan.id, status: 'trialing', trialEndsAt: organization.trialEndsAt },
        create: { organizationId: organization.id, planId: plan.id, status: 'trialing', trialEndsAt: organization.trialEndsAt },
      });
      await prisma.saaSOrganizationMembership.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: admin.id } },
        update: { role: 'owner', status: 'active' },
        create: { organizationId: organization.id, userId: admin.id, role: 'owner', status: 'active' },
      });
      const department = await prisma.reportingDepartment.upsert({
        where: { organizationId_code: { organizationId: organization.id, code: 'OPS' } },
        update: { name: 'Operations' },
        create: { organizationId: organization.id, name: 'Operations', code: 'OPS' },
      });
      const position = await prisma.reportingPosition.upsert({
        where: { organizationId_code: { organizationId: organization.id, code: 'IT-001' } },
        update: { name: 'IT Support Specialist', departmentId: department.id },
        create: { organizationId: organization.id, name: 'IT Support Specialist', code: 'IT-001', departmentId: department.id },
      });

      for (let index = 1; index <= 2; index += 1) {
        const username = `${fixture.slug.replaceAll('-', '')}.employee${index}@example.test`;
        const user = await prisma.user.upsert({
          where: { username },
          update: { passwordHash, role: 'employee', status: 'active' },
          create: { username, passwordHash, role: 'employee', status: 'active' },
        });
        const membership = await prisma.saaSOrganizationMembership.upsert({
          where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
          update: { role: 'member', status: 'active' },
          create: { organizationId: organization.id, userId: user.id, role: 'member', status: 'active' },
        });
        const employee = await prisma.reportingEmployee.upsert({
          where: { membershipId: membership.id },
          update: { displayName: username, departmentId: department.id, positionId: position.id, status: 'active' },
          create: { organizationId: organization.id, membershipId: membership.id, employeeCode: `${fixture.planCode.toUpperCase()}-${index}`, displayName: username, departmentId: department.id, positionId: position.id },
        });
        await prisma.reportingDailyReport.upsert({
          where: { employeeId_reportDate: { employeeId: employee.id, reportDate: '2026-09-09' } },
          update: { activityText: 'Resolved technical support tickets and completed network maintenance.', comments: 'Synthetic certification fixture.' },
          create: { organizationId: organization.id, employeeId: employee.id, reportDate: '2026-09-09', activityText: 'Resolved technical support tickets and completed network maintenance.', comments: 'Synthetic certification fixture.' },
        });
      }
      await prisma.saaSAuditLog.create({ data: { organizationId: organization.id, actorUserId: admin.id, action: 'synthetic_seed', resourceType: 'organization', resourceId: organization.id, metadata: { source: 'certification' } } });

      // Organization administrator fixture (additive). Gives certification and
      // local development a dedicated ORG_ADMIN without touching existing rows.
      const orgAdminUsername = `${fixture.slug.replaceAll('-', '')}.orgadmin@example.test`;
      const orgAdmin = await prisma.user.upsert({
        where: { username: orgAdminUsername },
        update: { passwordHash, role: 'admin', status: 'active' },
        create: { username: orgAdminUsername, passwordHash, role: 'admin', status: 'active' },
      });
      await prisma.saaSOrganizationMembership.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: orgAdmin.id } },
        update: { role: 'admin', status: 'active' },
        create: { organizationId: organization.id, userId: orgAdmin.id, role: 'admin', status: 'active' },
      });
    }
    console.log('Platform and synthetic certification fixtures seeded.');
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error) => {
  console.error('Platform administrator seed failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
