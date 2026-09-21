import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/auth'
import { queueEmail, trialCredentialsEmail } from '@/lib/email'
import { TRIAL_PERIOD_DAYS } from '@/lib/lifecycle'

// Platform control-plane review of marketing trial requests.
//
//   PATCH — act on a request: { action: 'dismiss' } closes it without
//           provisioning; { action: 'approve' } provisions a full trial
//           organization (TRIAL_PERIOD_DAYS = 14 days / two weeks), an owner
//           admin user, an owner membership, a trialing Starter subscription,
//           and an audit-log entry inside a single transaction. The generated
//           temporary password is returned exactly once and never persisted in
//           plain text.

const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

function generateTemporaryPassword(length = 14): string {
  const bytes = randomBytes(length)
  let password = ''
  for (let index = 0; index < length; index += 1) {
    password += PASSWORD_ALPHABET[bytes[index] % PASSWORD_ALPHABET.length]
  }
  return password
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace'
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base)
  const taken = new Set(
    (await db.saaSOrganization.findMany({ where: { slug: { startsWith: root } }, select: { slug: true } })).map(
      (row) => row.slug,
    ),
  )
  if (!taken.has(root)) return root
  let counter = 2
  while (taken.has(`${root}-${counter}`)) counter += 1
  return `${root}-${counter}`
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const payload = await authenticateRequest(request)
  if (!payload) return unauthorizedResponse()
  if (payload.role !== 'super_admin') {
    return forbiddenResponse('Natural Intellects platform administrator access required')
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const action = typeof body?.action === 'string' ? body.action : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : null

  const trialRequest = await db.trialRequest.findUnique({ where: { id } })
  if (!trialRequest) return NextResponse.json({ error: 'Trial request not found' }, { status: 404 })
  if (trialRequest.status !== 'pending') {
    return NextResponse.json({ error: `This request has already been ${trialRequest.status}.` }, { status: 409 })
  }

  if (action === 'dismiss') {
    const updated = await db.trialRequest.update({
      where: { id },
      data: { status: 'dismissed', reviewedAt: new Date(), reviewedBy: payload.username, notes },
      select: { id: true, status: true },
    })
    return NextResponse.json({ request: updated })
  }

  if (action !== 'approve') {
    return NextResponse.json({ error: 'Unknown action. Use "approve" or "dismiss".' }, { status: 400 })
  }

  // Provision the trial workspace. The temporary password is returned once in
  // the response so the platform administrator can hand it to the customer.
  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await hashPassword(temporaryPassword)
  const slug = await uniqueSlug(trialRequest.organizationName)
  const trialEndsAt = new Date(Date.now() + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000)

  const result = await db.$transaction(async (tx) => {
    const organization = await tx.saaSOrganization.create({
      data: {
        name: trialRequest.organizationName,
        slug,
        status: 'trial',
        trialStartedAt: new Date(),
        trialEndsAt,
      },
      select: { id: true, name: true, slug: true, trialEndsAt: true },
    })

    const adminUser = await tx.user.create({
      data: {
        username: trialRequest.contactEmail,
        passwordHash,
        role: 'admin',
        status: 'active',
        // The account starts on a one-time temporary password — force the
        // first-login "set a new password" nudge until it is replaced.
        mustChangePassword: true,
      },
      select: { id: true, username: true },
    })

    await tx.saaSOrganizationMembership.create({
      data: { organizationId: organization.id, userId: adminUser.id, role: 'owner', status: 'active' },
    })

    const starterPlan = await tx.saaSPlan.findUnique({ where: { code: 'starter' }, select: { id: true } })
    if (starterPlan) {
      await tx.saaSSubscription.create({
        data: {
          organizationId: organization.id,
          planId: starterPlan.id,
          status: 'trialing',
          billingInterval: 'monthly',
          provider: 'manual',
          currentPeriodStart: new Date(),
          trialEndsAt,
        },
      })
    }

    await tx.saaSAuditLog.create({
      data: {
        organizationId: organization.id,
        actorUserId: payload.userId,
        action: 'trial_provisioned',
        resourceType: 'trial_request',
        resourceId: trialRequest.id,
        metadata: { contactEmail: trialRequest.contactEmail, industry: trialRequest.industry },
      },
    })

    await tx.trialRequest.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: payload.username,
        notes,
        provisionedOrgId: organization.id,
      },
    })

    return { organization, adminUsername: adminUser.username }
  })

  // Deliver the credentials by email (outbox provider records the delivery;
  // SMTP sends it for real when configured). Never blocks provisioning.
  const emailResult = await queueEmail(
    trialCredentialsEmail({
      to: trialRequest.contactEmail,
      organizationName: result.organization.name,
      adminUsername: result.adminUsername,
      temporaryPassword,
      slug: result.organization.slug,
      trialEndsAt: result.organization.trialEndsAt,
    }),
  )

  return NextResponse.json({
    organization: result.organization,
    adminUsername: result.adminUsername,
    temporaryPassword,
    loginUrl: '/login',
    email: emailResult ? { status: emailResult.status, provider: emailResult.provider } : null,
    message:
      'Trial workspace provisioned. Share the temporary password with the customer — it will not be shown again.',
  })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
