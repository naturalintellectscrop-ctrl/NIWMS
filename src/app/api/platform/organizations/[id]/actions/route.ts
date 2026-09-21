import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/auth'
import { graceEndFrom, purgeOrganization } from '@/lib/lifecycle'

// Platform-owner client control actions.
//
//   POST /api/platform/organizations/[id]/actions
//   { action: 'ban' | 'unban' | 'suspend' | 'reactivate' | 'extend' | 'purge',
//     days?: number, target?: 'trial' | 'subscription', reason?: string }
//
// Every action is super_admin-only, audited twice: a global AuditEvent row
// (organizationId is a plain string, so it survives even a full purge) and an
// organization-scoped SaaSAuditLog entry where the organization still exists.

const DAY_MS = 24 * 60 * 60 * 1000
const ACTIONS = ['ban', 'unban', 'suspend', 'reactivate', 'extend', 'purge'] as const
type Action = (typeof ACTIONS)[number]

async function audit(input: {
  globalActorId: string
  organizationId: string
  organizationName: string
  action: string
  metadata: Record<string, unknown>
  orgScoped?: boolean
}) {
  // Global audit row: organizationId stays null because the AuditEvent FK targets
  // the legacy tenant table; SaaS organizations are identified via entityId.
  await db.auditEvent.create({
    data: {
      organizationId: null,
      actorUserId: input.globalActorId,
      action: input.action,
      entityType: 'SaaSOrganization',
      entityId: input.organizationId,
      metadata: JSON.stringify({ name: input.organizationName, ...input.metadata }),
    },
  })
  if (input.orgScoped) {
    await db.saaSAuditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.globalActorId,
        action: input.action,
        resourceType: 'SaaSOrganization',
        resourceId: input.organizationId,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    }).catch(() => undefined) // org may already be purged; the global row is the receipt
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const payload = await authenticateRequest(request)
  if (!payload) return unauthorizedResponse()
  if (payload.role !== 'super_admin') {
    return forbiddenResponse('Natural Intellects platform administrator access required')
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const action = typeof body?.action === 'string' ? body.action : ''
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `Unknown action. Use one of: ${ACTIONS.join(', ')}.` }, { status: 400 })
  }

  const organization = await db.saaSOrganization.findUnique({
    where: { id },
    include: { subscriptions: { select: { id: true, status: true, currentPeriodEnd: true, currentPeriodStart: true } } },
  })
  if (!organization) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const subscription = organization.subscriptions[0] ?? null
  const now = new Date()
  const actorId = payload.userId ?? payload.username ?? 'platform-owner'

  // ---- BAN: immediate permanent lock-out. Data is retained, engine skips banned orgs. ----
  if (action === 'ban') {
    const reason = typeof body?.reason === 'string' && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : 'Banned by platform owner'
    const updated = await db.saaSOrganization.update({
      where: { id },
      data: { status: 'banned', bannedAt: now, bannedReason: reason },
      select: { id: true, status: true, bannedAt: true },
    })
    await audit({ globalActorId: actorId, organizationId: id, organizationName: organization.name, action: 'ORG_BANNED', metadata: { reason }, orgScoped: true })
    return NextResponse.json({ organization: updated, message: `Banned "${organization.name}". Sign-in is blocked immediately; data retained.` })
  }

  // ---- UNBAN: restore a sensible lifecycle state based on where time stands. ----
  if (action === 'unban') {
    const periodValid = subscription?.status === 'active' && !!subscription.currentPeriodEnd && subscription.currentPeriodEnd > now
    const trialValid = organization.trialEndsAt > now
    let nextStatus: string
    let graceEndsAt: Date | null = null
    if (periodValid) {
      nextStatus = 'active'
    } else if (trialValid) {
      nextStatus = 'trial'
    } else {
      nextStatus = 'grace'
      graceEndsAt = graceEndFrom(now) // one month to resume payment, data retained
    }
    const updated = await db.saaSOrganization.update({
      where: { id },
      data: { status: nextStatus, bannedAt: null, bannedReason: null, graceEndsAt },
      select: { id: true, status: true, graceEndsAt: true },
    })
    await audit({ globalActorId: actorId, organizationId: id, organizationName: organization.name, action: 'ORG_UNBANNED', metadata: { nextStatus, graceEndsAt }, orgScoped: true })
    return NextResponse.json({ organization: updated, message: `Unbanned "${organization.name}" — restored to ${nextStatus}.` })
  }

  // ---- SUSPEND (turn off): manual off-switch, data retained, engine skips. ----
  if (action === 'suspend') {
    const updated = await db.saaSOrganization.update({
      where: { id },
      data: { status: 'suspended' },
      select: { id: true, status: true },
    })
    await audit({ globalActorId: actorId, organizationId: id, organizationName: organization.name, action: 'ORG_SUSPENDED_MANUAL', metadata: {}, orgScoped: true })
    return NextResponse.json({ organization: updated, message: `Suspended "${organization.name}". Sign-in blocked; data retained until you reactivate.` })
  }

  // ---- REACTIVATE: turn a suspended/paused client back on. ----
  if (action === 'reactivate') {
    const updated = await db.$transaction(async (tx) => {
      if (subscription && (!subscription.currentPeriodEnd || subscription.currentPeriodEnd <= now)) {
        // Give the reactivated client a fresh 30-day paid window.
        await tx.saaSSubscription.update({
          where: { id: subscription.id },
          data: { status: 'active', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS) },
        })
      } else if (subscription && subscription.status !== 'active') {
        await tx.saaSSubscription.update({ where: { id: subscription.id }, data: { status: 'active' } })
      }
      return tx.saaSOrganization.update({
        where: { id },
        data: { status: 'active', graceEndsAt: null, bannedAt: null, bannedReason: null },
        select: { id: true, status: true },
      })
    })
    await audit({
      globalActorId: actorId,
      organizationId: id,
      organizationName: organization.name,
      action: 'ORG_REACTIVATED',
      metadata: { grantedPeriodDays: subscription ? 30 : 0 },
      orgScoped: true,
    })
    return NextResponse.json({ organization: updated, message: `Reactivated "${organization.name}"${subscription ? ' with a fresh 30-day window.' : '.'}` })
  }

  // ---- EXTEND: increase the client's remaining time (trial or paid period). ----
  if (action === 'extend') {
    const days = Number(body?.days)
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return NextResponse.json({ error: 'days must be an integer between 1 and 3650.' }, { status: 400 })
    }
    const requestedTarget = body?.target === 'trial' || body?.target === 'subscription' ? (body.target as 'trial' | 'subscription') : null
    const autoTarget: 'trial' | 'subscription' = requestedTarget ??
      ((organization.status === 'trial' && organization.trialEndsAt > now) || !subscription ? 'trial' : 'subscription')

    if (autoTarget === 'trial') {
      const base = organization.trialEndsAt > now ? organization.trialEndsAt : now
      const trialEndsAt = new Date(base.getTime() + days * DAY_MS)
      const updated = await db.saaSOrganization.update({
        where: { id },
        data: {
          trialEndsAt,
          // Rescuing a paused client by granting time restores them; banned stays banned.
          ...(organization.status !== 'banned' ? { status: 'trial', graceEndsAt: null } : {}),
        },
        select: { id: true, status: true, trialEndsAt: true },
      })
      await audit({ globalActorId: actorId, organizationId: id, organizationName: organization.name, action: 'TRIAL_EXTENDED', metadata: { days, trialEndsAt }, orgScoped: true })
      return NextResponse.json({ organization: updated, message: `Extended "${organization.name}" trial by ${days} day(s) — now ends ${trialEndsAt.toISOString().slice(0, 10)}.` })
    }

    if (!subscription) return NextResponse.json({ error: 'No subscription to extend.' }, { status: 409 })
    const base = subscription.currentPeriodEnd && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now
    const currentPeriodEnd = new Date(base.getTime() + days * DAY_MS)
    const updated = await db.$transaction(async (tx) => {
      await tx.saaSSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          currentPeriodStart: subscription.currentPeriodStart ?? now,
          currentPeriodEnd,
        },
      })
      return tx.saaSOrganization.update({
        where: { id },
        data: {
          ...(organization.status !== 'banned' ? { status: 'active', graceEndsAt: null } : {}),
        },
        select: { id: true, status: true },
      })
    })
    await audit({ globalActorId: actorId, organizationId: id, organizationName: organization.name, action: 'SUBSCRIPTION_EXTENDED', metadata: { days, currentPeriodEnd }, orgScoped: true })
    return NextResponse.json({ organization: updated, message: `Extended "${organization.name}" subscription by ${days} day(s) — now ends ${currentPeriodEnd.toISOString().slice(0, 10)}.` })
  }

  // ---- PURGE: immediate full data deletion (otherwise automatic after grace). ----
  if (action === 'purge') {
    if (organization.organizationType === 'LEGACY') {
      return NextResponse.json({ error: 'Refusing to purge a legacy federation tenant from the API. Handle manually in the database.' }, { status: 403 })
    }
    const purged = await purgeOrganization(id, typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : 'Purged by platform owner')
    if (!purged) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    return NextResponse.json({ purged: true, message: `"${organization.name}" and all of its data have been permanently deleted. A tombstone audit record was kept.` })
  }

  return NextResponse.json({ error: 'Unhandled action' }, { status: 400 })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
