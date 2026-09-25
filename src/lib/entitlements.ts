import { db } from '@/lib/db'

export const DEFAULT_PLANS = [
  { key: 'starter', name: 'Starter', description: 'A focused foundation for small teams.', monthlyPrice: 30000, maxEmployees: 10, entitlements: ['employee_reporting', 'daily_reports', 'monthly_reports', 'excel_export', 'reminders', 'voice_reporting', 'basic_analytics', 'limited_departments'] },
  { key: 'business', name: 'Business', description: 'More visibility for growing organizations.', monthlyPrice: 75000, maxEmployees: 30, entitlements: ['employee_reporting', 'daily_reports', 'monthly_reports', 'excel_export', 'reminders', 'voice_reporting', 'basic_analytics', 'departments', 'advanced_analytics', 'advanced_reports'] },
  { key: 'professional', name: 'Professional', description: 'Reporting depth for established teams.', monthlyPrice: 150000, maxEmployees: 75, entitlements: ['employee_reporting', 'daily_reports', 'monthly_reports', 'excel_export', 'reminders', 'voice_reporting', 'basic_analytics', 'departments', 'advanced_analytics', 'advanced_reports', 'custom_reports', 'integrations', 'priority_support'] },
  { key: 'enterprise', name: 'Enterprise', description: 'A plan shaped around your operating model.', monthlyPrice: 0, maxEmployees: null, entitlements: ['all_features'], customPricing: true },
] as const

export async function ensureDefaultPlans() {
  // Seeding guard (Task 23 audit): public GET endpoints call this on every hit.
  // Only CREATE rows that are missing — never rewrite existing plan rows
  // (removes write-on-read amplification and accidental overwrites of
  // operator-edited pricing). Full-catalog upserts live in provisioning
  // scripts (scripts/supabase-provision.ts, prisma/seed.js).
  const existing = await db.plan.findMany({ select: { key: true } })
  const known = new Set(existing.map((row) => row.key))
  const missing = DEFAULT_PLANS.filter((plan) => !known.has(plan.key))
  if (missing.length === 0) return
  await Promise.all(missing.map((plan) => {
    const data = { key: plan.key, name: plan.name, monthlyPrice: plan.monthlyPrice, maxEmployees: plan.maxEmployees, active: true, entitlements: JSON.stringify(plan.entitlements) }
    return db.plan.create({ data })
  }))
}

export async function getOrganizationEntitlements(organizationId: string) {
  const subscription = await db.subscription.findUnique({ where: { organizationId }, include: { plan: true, organization: true } })
  const plan = subscription?.plan
  const entitlements = plan ? JSON.parse(plan.entitlements) as string[] : []
  return { plan, subscription, entitlements, status: subscription?.status ?? 'trialing', organization: subscription?.organization }
}

export async function hasFeature(organizationId: string, feature: string) {
  const access = await getOrganizationEntitlements(organizationId)
  return access.status !== 'suspended' && access.status !== 'archived' && access.entitlements.includes(feature)
}

export async function getEntitlements(organizationId: string) {
  const access = await getOrganizationEntitlements(organizationId)
  return access.entitlements
}

export async function getEmployeeLimit(organizationId: string) {
  const access = await getOrganizationEntitlements(organizationId)
  return access.plan?.maxEmployees ?? null
}

export async function checkUsageLimit(organizationId: string, usage: 'employees' | 'reports') {
  const access = await getOrganizationEntitlements(organizationId)
  if (usage === 'employees') return canAddEmployee(organizationId)
  if (!access.plan) return false
  const reports = await db.dailyReport.count({ where: { user: { organizationId } } })
  return access.plan.maxEmployees === null || reports < access.plan.maxEmployees * 10
}

export async function canAddEmployee(organizationId: string) {
  const access = await getOrganizationEntitlements(organizationId)
  if (!access.plan?.maxEmployees) return true
  const count = await db.user.count({ where: { organizationId, role: 'employee', status: 'active' } })
  return count < access.plan.maxEmployees
}
