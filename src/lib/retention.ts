import { db } from '@/lib/db'

export const RETENTION_DAYS = 60

export function getRetentionEnd(suspendedAt: Date, retentionDays = RETENTION_DAYS) {
  return new Date(suspendedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000)
}

export function isEligibleForDeletion(status: string, retentionEndsAt: Date | null, now = new Date()) {
  return status === 'pending_deletion' && Boolean(retentionEndsAt && now >= retentionEndsAt)
}

export async function requestOrganizationDeletion(organizationId: string, requestedByUserId: string) {
  const organization = await db.organization.findUnique({ where: { id: organizationId } })
  if (!organization || organization.status !== 'suspended') throw new Error('Organization must be suspended before deletion can be requested')

  const retentionEndsAt = organization.retentionEndsAt ?? getRetentionEnd(organization.suspendedAt ?? new Date())
  return db.$transaction(async (tx) => {
    const updated = await tx.organization.update({ where: { id: organizationId }, data: { status: 'pending_deletion', retentionEndsAt, deletionScheduledAt: retentionEndsAt } })
    await tx.auditEvent.create({ data: { organizationId, actorUserId: requestedByUserId, action: 'DELETION_REQUESTED', entityType: 'Organization', entityId: organizationId, metadata: JSON.stringify({ retentionEndsAt }) } })
    return updated
  })
}

export async function confirmOrganizationDeletion(organizationId: string, confirmedByUserId: string) {
  const organization = await db.organization.findUnique({ where: { id: organizationId } })
  if (!organization || !isEligibleForDeletion(organization.status, organization.retentionEndsAt)) throw new Error('Organization is not eligible for permanent deletion')

  return db.$transaction(async (tx) => {
    const claimed = await tx.organization.updateMany({ where: { id: organizationId, status: 'pending_deletion' }, data: { status: 'archived', archivedAt: new Date() } })
    if (claimed.count !== 1) throw new Error('Deletion was already claimed or organization state changed')
    await tx.auditEvent.create({ data: { organizationId, actorUserId: confirmedByUserId, action: 'DELETION_CONFIRMED', entityType: 'Organization', entityId: organizationId, metadata: JSON.stringify({ irreversible: true }) } })
    return tx.organization.findUnique({ where: { id: organizationId } })
  })
}
