import { db } from '@/lib/db'
import { authenticateRequest, type JWTPayload } from '@/lib/auth'
import type { NextRequest } from 'next/server'

export type CanonicalIdentity = {
  userId: string
  organizationId: string
  membershipId: string
  role: string
  username: string
}

export async function resolveCanonicalIdentity(request: NextRequest): Promise<CanonicalIdentity | null> {
  const payload = await authenticateRequest(request)
  return payload ? resolveCanonicalPayload(payload) : null
}

export async function resolveCanonicalPayload(payload: JWTPayload): Promise<CanonicalIdentity | null> {
  const membership = await db.saaSOrganizationMembership.findFirst({
    where: {
      userId: payload.userId,
      status: 'active',
      organization: { status: { notIn: ['suspended', 'archived'] } },
    },
    select: {
      id: true,
      userId: true,
      role: true,
      organizationId: true,
      organization: { select: { id: true } },
    },
  })

  if (!membership) return null

  return {
    userId: membership.userId,
    organizationId: membership.organization.id,
    membershipId: membership.id,
    role: membership.role,
    username: payload.username,
  }
}

export function identityMatchesScope(identity: CanonicalIdentity, organizationId: string, userId?: string) {
  return identity.organizationId === organizationId && (!userId || identity.userId === userId)
}
