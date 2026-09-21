import { db } from '@/lib/db'

// Subscription lifecycle engine for NIWMS SaaS organizations.
//
// States: trial → (trial ends) → grace [PAUSED, data retained] → (grace ends) → purged.
// Paid subscriptions: active → (currentPeriodEnd passes) → grace [PAUSED] → purged.
// Owner overrides: banned (permanent, engine skips), suspended (manual off-switch, engine skips).
// Grace period is ONE MONTH (30 days) per platform policy: paused clients keep their data
// for a maximum of one month, then the workspace and ALL its data are fully deleted.
// Every new workspace starts with a TWO-WEEK (14-day) free trial — no payment details.
// Complimentary clients (billingMode 'exempt', e.g. the UFMI federation) are engine-immune:
// they use the full platform with no payment mode and are never paused or purged.

export const GRACE_PERIOD_DAYS = 30
export const TRIAL_PERIOD_DAYS = 14
export const BILLING_MODES = ['standard', 'exempt'] as const
export type BillingMode = (typeof BILLING_MODES)[number]
const DAY_MS = 24 * 60 * 60 * 1000

export function graceEndFrom(base: Date): Date {
  return new Date(base.getTime() + GRACE_PERIOD_DAYS * DAY_MS)
}

type LifecycleSyncResult = {
  status: string
  action: 'none' | 'grace_started' | 'subscription_expired' | 'organization_purged'
  // Billing mode of the synced organization (null when the id has no SaaS twin,
  // e.g. a pure legacy tenant id). Consumers use it for exempt-aware access gates.
  billingMode?: string | null
}

/**
 * Bring one organization's lifecycle state in line with the passage of time.
 * Idempotent: repeated calls within the same phase are no-ops (audit-deduped).
 * Never touches archived, banned, or suspended orgs (those are owner-controlled states).
 */
export async function syncOrganizationLifecycle(organizationId: string): Promise<LifecycleSyncResult> {
  const organization = await db.saaSOrganization.findUnique({
    where: { id: organizationId },
    include: { subscriptions: { select: { id: true, status: true, currentPeriodEnd: true } } },
  })
  if (!organization) return { status: 'missing', action: 'none', billingMode: null }
  // LEGACY federation tenants are owner-managed: the engine never pauses or purges
  // them automatically (the owner has explicit ban/suspend/extend/purge actions).
  if (organization.organizationType === 'LEGACY') return { status: organization.status, action: 'none', billingMode: organization.billingMode }
  // Complimentary clients use the platform with no payment mode: the time engine
  // never pauses, converts, or purges them (owner bans/suspensions still apply
  // because those states short-circuit below on their own).
  if (organization.billingMode === 'exempt') return { status: organization.status, action: 'none', billingMode: organization.billingMode }
  if (organization.status === 'archived' || organization.status === 'banned' || organization.status === 'suspended') {
    return { status: organization.status, action: 'none', billingMode: organization.billingMode }
  }

  const now = new Date()
  const subscription = organization.subscriptions[0] ?? null

  // 1. Paid subscription expired: the client's paid time is over → pause into grace.
  if (
    organization.status === 'active' &&
    subscription &&
    subscription.status === 'active' &&
    subscription.currentPeriodEnd &&
    now > subscription.currentPeriodEnd
  ) {
    const graceEndsAt = graceEndFrom(subscription.currentPeriodEnd)
    await db.$transaction(async (tx) => {
      await tx.saaSSubscription.update({ where: { id: subscription.id }, data: { status: 'expired' } })
      await tx.saaSOrganization.update({ where: { id: organizationId }, data: { status: 'grace', graceEndsAt } })
      await tx.saaSAuditLog.create({
        data: {
          organizationId,
          action: 'SUBSCRIPTION_EXPIRED',
          resourceType: 'SaaSSubscription',
          resourceId: subscription.id,
          metadata: { currentPeriodEnd: subscription.currentPeriodEnd, graceEndsAt, paused: true },
        },
      })
    })
    if (now > graceEndsAt) {
      // Period ended and even the grace window already ran out (e.g. long cron gap).
      await purgeOrganization(organizationId, 'Grace period ended after subscription expiry (backdated catch-up)')
      return { status: 'purged', action: 'organization_purged' }
    }
    return { status: 'grace', action: 'subscription_expired' }
  }

  // 2. Trial expired: pause into grace (one month to convert, data retained).
  if (organization.status === 'trial' && organization.trialEndsAt && now > organization.trialEndsAt) {
    const graceEndsAt = organization.graceEndsAt ?? graceEndFrom(organization.trialEndsAt)
    const action = now > graceEndsAt ? 'grace_over' : 'grace_started'
    if (action === 'grace_started') {
      const prior = await db.saaSAuditLog.findFirst({
        where: { organizationId, action: 'GRACE_STARTED', resourceId: organizationId },
      })
      if (prior) return { status: 'grace', action: 'none' }
      await db.$transaction(async (tx) => {
        await tx.saaSOrganization.update({ where: { id: organizationId }, data: { status: 'grace', graceEndsAt } })
        await tx.saaSAuditLog.create({
          data: {
            organizationId,
            action: 'GRACE_STARTED',
            resourceType: 'SaaSOrganization',
            resourceId: organizationId,
            metadata: { graceEndsAt, paused: true },
          },
        })
      })
      return { status: 'grace', action: 'grace_started' }
    }
    // Trial AND grace are both over → fully delete the client's data.
    await purgeOrganization(organizationId, 'Trial grace period ended with no conversion')
    return { status: 'purged', action: 'organization_purged' }
  }

  // 3. Sitting in grace with the clock run out (subscription path or backdated trial path).
  if (organization.status === 'grace' && organization.graceEndsAt && now > organization.graceEndsAt) {
    await purgeOrganization(organizationId, 'One-month grace period ended with no payment')
    return { status: 'purged', action: 'organization_purged', billingMode: organization.billingMode }
  }

  return { status: organization.status, action: 'none', billingMode: organization.billingMode }
}

/**
 * Fully delete a client workspace and every piece of its data.
 * Organization-scoped rows cascade from the organization delete (memberships, subscriptions,
 * reporting departments/positions/employees/daily/monthly reports, comments, notifications,
 * usage events, deletion requests). Billing events and audit logs use SetNull FKs, so they
 * are removed explicitly for full data deletion. Users are deleted when they belong to no
 * other organization and carry no legacy-system records; otherwise they are archived.
 * A tombstone AuditEvent (organizationId is a plain string, no FK) survives deletion so the
 * platform owner keeps an immutable record of what was purged and when.
 */
export async function purgeOrganization(organizationId: string, reason: string): Promise<boolean> {
  const organization = await db.saaSOrganization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true, status: true, memberships: { select: { userId: true } } },
  })
  if (!organization) return false

  // Tombstone FIRST: this row survives the purge (organizationId is nullable and
  // deliberately left null — the audit table's FK targets the legacy tenant table,
  // not SaaS workspaces). The purged organization is identified by entityId + metadata.
  await db.auditEvent.create({
    data: {
      organizationId: null,
      actorUserId: null,
      action: 'ORGANIZATION_PURGED',
      entityType: 'SaaSOrganization',
      entityId: organizationId,
      metadata: JSON.stringify({
        name: organization.name,
        slug: organization.slug,
        priorStatus: organization.status,
        reason,
        purgedAt: new Date().toISOString(),
        gracePeriodDays: GRACE_PERIOD_DAYS,
      }),
    },
  })

  const userIds = [...new Set(organization.memberships.map((membership) => membership.userId))]

  await db.$transaction(async (tx) => {
    // SetNull-referenced rows must be removed explicitly for full data deletion.
    await tx.saaSBillingEvent.deleteMany({ where: { organizationId } })
    await tx.saaSAuditLog.deleteMany({ where: { organizationId } })

    // Users: delete SaaS-native users with no legacy footprint; archive the rest.
    for (const userId of userIds) {
      const [profiles, daily, monthly, notifications, auditLogs, otherMemberships] = await Promise.all([
        tx.employeeProfile.count({ where: { userId } }),
        tx.dailyReport.count({ where: { userId } }),
        tx.monthlyReport.count({ where: { userId } }),
        tx.notification.count({ where: { userId } }),
        tx.auditLog.count({ where: { userId } }),
        tx.saaSOrganizationMembership.count({ where: { userId, organizationId: { not: organizationId } } }),
      ])
      const hasLegacyFootprint = profiles + daily + monthly + notifications + auditLogs > 0
      if (hasLegacyFootprint || otherMemberships > 0) {
        await tx.user.update({ where: { id: userId }, data: { status: 'archived' } }).catch(() => undefined)
      } else {
        await tx.user.delete({ where: { id: userId } }).catch(() => undefined)
      }
    }

    // The organization delete cascades to: memberships, subscriptions, usage events,
    // deletion requests, reporting departments/positions/employees, daily/monthly reports,
    // report comments, and notifications.
    await tx.saaSOrganization.delete({ where: { id: organizationId } })
  })

  return true
}
