import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTokenFromRequest, verifyToken } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { requireOrganizationAdmin } from '@/lib/tenant'

// PATCH /api/admin/password-resets/[id] — resolve a reset request (set new password or reject)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { id } = await params
    const body = await request.json()
    const { action, newPassword } = body // action: 'resolve' | 'reject'

    if (!action || !['resolve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "resolve" or "reject"' }, { status: 400 })
    }

    // Scope the request to this organization: the requester must be linked via
    // the legacy User.organizationId OR an active canonical SaaS membership.
    const resetRequest = await db.passwordResetRequest.findFirst({ where: { id } })
    if (resetRequest) {
      const targetUser = await db.user.findUnique({
        where: { id: resetRequest.userId ?? '' },
        select: { organizationId: true },
      })
      const saasMember = targetUser?.organizationId === context.organizationId
        ? null
        : await db.saaSOrganizationMembership.findFirst({
            where: { userId: resetRequest.userId ?? '', organizationId: context.organizationId, status: 'active' },
            select: { id: true },
          })
      const legacyMember = targetUser?.organizationId === context.organizationId
      if (!legacyMember && !saasMember) {
        return NextResponse.json({ error: 'Reset request not found' }, { status: 404 })
      }
    }

    if (!resetRequest) {
      return NextResponse.json({ error: 'Reset request not found' }, { status: 404 })
    }

    if (resetRequest.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been processed' }, { status: 409 })
    }

    if (action === 'reject') {
      await db.passwordResetRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          resolvedBy: payload.userId,
          updatedAt: new Date(),
        },
      })
      return NextResponse.json({ message: 'Password reset request rejected' })
    }

    // Resolve: set new password
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    if (!resetRequest.userId) {
      return NextResponse.json({ error: 'No user associated with this request' }, { status: 400 })
    }

    const passwordHash = await hashPassword(newPassword)

    // Org scoping was verified above (legacy link or active SaaS membership),
    // so it is safe to update the requester's password by id.

    // Update the user's password and mark request as resolved. Bumping
    // tokenVersion revokes any of the requester's existing sessions, so a
    // reset reliably signs them out everywhere.
    await db.$transaction([
      db.user.update({
        where: { id: resetRequest.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      db.passwordResetRequest.update({
        where: { id },
        data: {
          status: 'resolved',
          resolvedBy: payload.userId,
          updatedAt: new Date(),
        },
      }),
    ])

    return NextResponse.json({ message: 'Password reset successfully. The employee can now log in with the new password.' })
  } catch (error) {
    console.error('Resolve password reset error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
