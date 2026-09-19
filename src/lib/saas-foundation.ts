import { db } from '@/lib/db'

export const SAAS_PLANS = [
  { code: 'starter', name: 'Starter', monthlyPriceCents: 0, annualPriceCents: 0, maxMembers: 10, maxReportsPerMonth: 100, features: ['reports', 'basic_exports'] },
  { code: 'business', name: 'Business', monthlyPriceCents: 4900, annualPriceCents: 49000, maxMembers: 50, maxReportsPerMonth: 1000, features: ['reports', 'basic_exports', 'monthly_reports', 'reminders'] },
  { code: 'professional', name: 'Professional', monthlyPriceCents: 12900, annualPriceCents: 129000, maxMembers: 250, maxReportsPerMonth: 5000, features: ['reports', 'basic_exports', 'monthly_reports', 'reminders', 'advanced_exports', 'audit_log'] },
  { code: 'enterprise', name: 'Enterprise', monthlyPriceCents: 0, annualPriceCents: 0, maxMembers: null, maxReportsPerMonth: null, features: ['reports', 'basic_exports', 'monthly_reports', 'reminders', 'advanced_exports', 'audit_log', 'priority_support'] },
] as const

export async function ensureSaaSPlans() {
  await Promise.all(SAAS_PLANS.map((plan) => db.saaSPlan.upsert({
    where: { code: plan.code },
    update: { ...plan, features: plan.features },
    create: { ...plan, features: plan.features },
  })))
}

export async function getSaaSAccess(organizationId: string) {
  const subscription = await db.saaSSubscription.findUnique({
    where: { organizationId },
    include: { plan: true, organization: true },
  })
  const features = subscription?.plan.features
  return {
    organization: subscription?.organization ?? null,
    subscription,
    plan: subscription?.plan ?? null,
    features: Array.isArray(features) ? features.filter((item): item is string => typeof item === 'string') : [],
  }
}

export async function hasSaaSFeature(organizationId: string, feature: string) {
  const access = await getSaaSAccess(organizationId)
  return !['suspended', 'archived', 'pending_deletion'].includes(access.organization?.status ?? '') && access.features.includes(feature)
}

export async function canAddSaaSMember(organizationId: string) {
  const access = await getSaaSAccess(organizationId)
  if (!access.plan?.maxMembers) return true
  const count = await db.saaSOrganizationMembership.count({ where: { organizationId, status: 'active' } })
  return count < access.plan.maxMembers
}

export async function transitionSaaSLifecycle(organizationId: string, now = new Date()) {
  const organization = await db.saaSOrganization.findUnique({ where: { id: organizationId } })
  if (!organization || ['archived', 'pending_deletion'].includes(organization.status)) return organization
  if (organization.status === 'trial' && now > organization.trialEndsAt) {
    const graceEndsAt = organization.graceEndsAt ?? new Date(organization.trialEndsAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    const status = now > graceEndsAt ? 'suspended' : 'grace'
    return db.saaSOrganization.update({ where: { id: organizationId }, data: { status, graceEndsAt } })
  }
  return organization
}
