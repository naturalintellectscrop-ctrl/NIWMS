/* eslint-disable @typescript-eslint/no-require-imports */
// Idempotent provisioning for the legacy UFMI federation on the NIWMS platform.
//
// UFMI (Uganda Federation of Movie Industry) predates the SaaS product. It is
// provisioned as a canonical organization with organizationType "LEGACY" so:
//   - users sign in through the tenant-aware /login (company: ufmi)
//   - LEGACY-type organizations are routed to the UFMI portal experience (/portal)
//   - every tenant-scoped API (admin + reporting) works unchanged
//
// Credentials follow the legacy system conventions:
//   - Admin      / Admin@UFMI256      (federation administrator)
//   - UFMI001..3 / Cinema@UFMI2026    (staff, id-number style usernames)
//
// Usage: node scripts/provision-ufmi.js   (safe to re-run)

const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const UFMI = {
  name: 'Uganda Federation of Movie Industry',
  slug: 'ufmi',
  admin: { username: 'Admin', password: 'Admin@UFMI256', employeeId: 'UFMI-ADM-001', position: 'Federation Administrator' },
  employees: [
    { username: 'UFMI001', password: 'Cinema@UFMI2026', employeeId: 'UFMI-EMP-001', name: 'Production Staff 1', position: 'Production Assistant' },
    { username: 'UFMI002', password: 'Cinema@UFMI2026', employeeId: 'UFMI-EMP-002', name: 'Production Staff 2', position: 'Editor' },
    { username: 'UFMI003', password: 'Cinema@UFMI2026', employeeId: 'UFMI-EMP-003', name: 'Production Staff 3', position: 'Location Coordinator' },
  ],
};

async function provision() {
  const prisma = new PrismaClient();
  try {
    const org = await prisma.saaSOrganization.upsert({
      where: { slug: UFMI.slug },
      update: { name: UFMI.name, organizationType: 'LEGACY', status: 'active' },
      create: {
        name: UFMI.name,
        slug: UFMI.slug,
        organizationType: 'LEGACY',
        status: 'active',
        trialStartedAt: new Date(),
        trialEndsAt: new Date(),
      },
    });

    // Grandfathered legacy arrangement: active subscription on the custom-priced plan.
    const enterprisePlan = await prisma.saaSPlan.upsert({
      where: { code: 'enterprise' },
      update: { isActive: true },
      create: { code: 'enterprise', name: 'Enterprise', monthlyPriceCents: 0, maxMembers: null, features: { all_features: true } },
    });
    await prisma.saaSSubscription.upsert({
      where: { organizationId: org.id },
      update: { status: 'active', planId: enterprisePlan.id, provider: 'manual', billingInterval: 'monthly' },
      create: {
        organizationId: org.id,
        planId: enterprisePlan.id,
        status: 'active',
        provider: 'manual',
        billingInterval: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const department = await prisma.reportingDepartment.upsert({
      where: { organizationId_code: { organizationId: org.id, code: 'PROD' } },
      update: { name: 'Production' },
      create: { organizationId: org.id, name: 'Production', code: 'PROD' },
    });

    async function provisionUser({ username, password, role, employeeId, position, name }) {
      const passwordHash = await bcrypt.hash(password, 12);
      // Canonical users carry no legacy organizationId — membership below is the link.
      const user = await prisma.user.upsert({
        where: { username },
        update: { role, status: 'active' },
        create: { username, passwordHash, role, status: 'active' },
      });
      await prisma.employeeProfile.upsert({
        where: { userId: user.id },
        update: { employeeId, position },
        create: { userId: user.id, employeeId, position },
      }).catch(async () => {
        // Some local schemas create the profile row on user create; refresh instead.
        await prisma.employeeProfile.update({ where: { userId: user.id }, data: { employeeId, position } });
      });
      const membership = await prisma.saaSOrganizationMembership.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
        update: { role: role === 'admin' ? 'admin' : 'member', status: 'active' },
        create: { organizationId: org.id, userId: user.id, role: role === 'admin' ? 'admin' : 'member', status: 'active' },
      });
      if (role === 'employee') {
        await prisma.reportingEmployee.upsert({
          where: { membershipId: membership.id },
          update: { displayName: name, departmentId: department.id, status: 'active' },
          create: {
            organizationId: org.id,
            membershipId: membership.id,
            employeeCode: employeeId,
            displayName: name,
            departmentId: department.id,
          },
        });
      }
      return user;
    }

    const admin = await provisionUser({ ...UFMI.admin, role: 'admin' });
    const employees = [];
    for (const employee of UFMI.employees) {
      employees.push(await provisionUser({ ...employee, role: 'employee' }));
    }

    await prisma.saaSAuditLog.create({
      data: {
        organizationId: org.id,
        actorUserId: admin.id,
        action: 'legacy_provisioning',
        resourceType: 'SaaSOrganization',
        resourceId: org.id,
        metadata: JSON.stringify({ source: 'provision-ufmi.js', employees: employees.length }),
      },
    });

    console.log(`UFMI provisioned: org=${org.id} admin=${admin.username} employees=${employees.map((u) => u.username).join(',')}`);
  } finally {
    await prisma.$disconnect();
  }
}

provision().catch((error) => {
  console.error('UFMI provisioning failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
