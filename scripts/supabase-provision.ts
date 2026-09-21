// =============================================================================
// One-off provisioning script for the production Supabase PostgreSQL database.
//
// Usage (never commit credentials):
//   SUPABASE_DATABASE_URL="postgresql://..." bun scripts/supabase-provision.ts
//
// Requires the Prisma client to be generated from prisma/schema.prisma (the
// PostgreSQL schema). Restore the local SQLite client afterwards:
//   bunx prisma generate --schema prisma/schema.local.prisma
//
// What it does:
//   1. Upserts the four default billing plans (same values as ensureDefaultPlans
//      in src/lib/entitlements.ts — keep both in sync) into the legacy `Plan`
//      catalog that powers /api/plans and the marketing pricing.
//   2. Upserts the four SaaS plan rows (`SaaSPlan` / plans table) that trial
//      provisioning and SaaSSubscription.planId reference by code.
//   3. Reads back both catalogs.
//   4. Lists every public base table (schema verification).
//   5. Reports existing row counts so an operator can confirm the database is
//      empty/non-production before provisioning.
// =============================================================================

import { PrismaClient } from '@prisma/client'

const url = process.env.SUPABASE_DATABASE_URL
if (!url) {
  console.error('SUPABASE_DATABASE_URL is required (never hardcode credentials).')
  process.exit(1)
}

const db = new PrismaClient({
  datasources: { db: { url } },
  log: ['error'],
})

const DEFAULT_PLANS = [
  { key: 'starter', name: 'Starter', monthlyPrice: 30000, maxEmployees: 10, entitlements: ['employee_reporting', 'daily_reports', 'monthly_reports', 'excel_export', 'reminders', 'voice_reporting', 'basic_analytics', 'limited_departments'] },
  { key: 'business', name: 'Business', monthlyPrice: 75000, maxEmployees: 30, entitlements: ['employee_reporting', 'daily_reports', 'monthly_reports', 'excel_export', 'reminders', 'voice_reporting', 'basic_analytics', 'departments', 'advanced_analytics', 'advanced_reports'] },
  { key: 'professional', name: 'Professional', monthlyPrice: 150000, maxEmployees: 75, entitlements: ['employee_reporting', 'daily_reports', 'monthly_reports', 'excel_export', 'reminders', 'voice_reporting', 'basic_analytics', 'departments', 'advanced_analytics', 'advanced_reports', 'custom_reports', 'integrations', 'priority_support'] },
  { key: 'enterprise', name: 'Enterprise', monthlyPrice: 0, maxEmployees: null, entitlements: ['all_features'] },
] as const

async function main() {
  // 1. Seed the plan catalog (idempotent upsert on key).
  for (const plan of DEFAULT_PLANS) {
    const data = {
      key: plan.key,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      maxEmployees: plan.maxEmployees,
      active: true,
      entitlements: JSON.stringify(plan.entitlements),
    }
    await db.plan.upsert({ where: { key: plan.key }, update: data, create: data })
  }
  console.log('✓ plan catalog upserted')

  // 1b. SaaS plan rows (SaaSSubscription.planId target, code-referenced by trial provisioning).
  const SAAS_PLANS = [
    { code: 'starter', name: 'Starter', monthlyPriceCents: 3000000, annualPriceCents: 32400000, maxMembers: 10 },
    { code: 'business', name: 'Business', monthlyPriceCents: 7500000, annualPriceCents: 81000000, maxMembers: 30 },
    { code: 'professional', name: 'Professional', monthlyPriceCents: 15000000, annualPriceCents: 162000000, maxMembers: 75 },
    { code: 'enterprise', name: 'Enterprise', monthlyPriceCents: 0, annualPriceCents: 0, maxMembers: null },
  ] as const
  for (const plan of SAAS_PLANS) {
    const data = {
      code: plan.code,
      name: plan.name,
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
      maxMembers: plan.maxMembers,
      features: { reporting: true },
      isActive: true,
    }
    await db.saaSPlan.upsert({ where: { code: plan.code }, update: data, create: data })
  }
  console.log('✓ SaaS plan rows upserted')

  // 2. Read back.
  const plans = await db.plan.findMany({ orderBy: { monthlyPrice: 'asc' } })
  console.log(
    '✓ plans:',
    plans.map((p) => `${p.key}=UGX ${p.monthlyPrice}${p.maxEmployees === null ? ' (custom)' : ` / ≤${p.maxEmployees} employees`}`).join(' | '),
  )
  const saasPlans = await db.saaSPlan.findMany({ orderBy: { code: 'asc' } })
  console.log(
    '✓ SaaS plans:',
    saasPlans.map((p) => `${p.code}=${p.monthlyPriceCents}c`).join(' | '),
  )

  // 3. List public base tables — proves the domain schema exists.
  const tables = (await db.$queryRawUnsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
  )) as Array<{ table_name: string }>
  console.log(`✓ public tables (${tables.length}):`, tables.map((t) => t.table_name).join(', '))

  // 4. Existing row counts — expect zeros on a fresh production database.
  const [organizations, users, subscriptions, dailyReports, monthlyReports] = await Promise.all([
    db.organization.count(),
    db.user.count(),
    db.subscription.count(),
    db.dailyReport.count(),
    db.monthlyReport.count(),
  ])
  console.log(`✓ row counts — organizations: ${organizations}, users: ${users}, subscriptions: ${subscriptions}, dailyReports: ${dailyReports}, monthlyReports: ${monthlyReports}`)
}

main()
  .catch((error) => {
    console.error('✗ provisioning failed:', error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
