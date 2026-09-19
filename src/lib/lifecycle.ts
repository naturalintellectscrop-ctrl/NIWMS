import { db } from '@/lib/db'

export async function syncOrganizationLifecycle(organizationId: string) {
  const organization = await db.saaSOrganization.findUnique({ where: { id: organizationId } })
  if (!organization || organization.status === 'archived') return organization
  const now = new Date()
  if (organization.status === 'trial' && organization.trialEndsAt && now > organization.trialEndsAt) {
    const graceEndsAt = organization.graceEndsAt || new Date(organization.trialEndsAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    const status = now > graceEndsAt ? 'suspended' : 'grace'
    const action = status === 'grace' ? 'GRACE_STARTED' : 'ORG_SUSPENDED'
    const prior = await db.saaSAuditLog.findFirst({ where: { organizationId, action, resourceId: organizationId } })
    if (prior) return organization
    return db.$transaction(async (tx) => {
      const updated = await tx.saaSOrganization.update({ where: { id: organizationId }, data: { status, graceEndsAt } })
      await tx.saaSAuditLog.create({ data: { organizationId, action, resourceType: 'SaaSOrganization', resourceId: organizationId, metadata: { graceEndsAt } } })
      return updated
    })
  }
  return organization
}
