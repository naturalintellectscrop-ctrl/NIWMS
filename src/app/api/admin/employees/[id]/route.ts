import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { requireOrganizationAdmin } from '@/lib/tenant'

// Helper: authenticate admin
async function authenticateAdmin(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

// Resolve the target user and verify it belongs to the administrator's
// organization through the legacy link OR an active canonical membership.
async function findOrganizationUser(userId: string, organizationId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { profile: true, memberships: true },
  })
  if (!user) return null
  const legacyMatch =
    user.organizationId === organizationId ||
    user.memberships.some((membership) => membership.organizationId === organizationId && membership.status === 'active')
  if (legacyMatch) return user
  const canonicalMembership = await db.saaSOrganizationMembership.findFirst({
    where: { userId, organizationId, status: 'active' },
  })
  return canonicalMembership ? user : null
}

// PATCH /api/admin/employees/[id] - Update employee
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { id } = await params
    const body = await request.json()
    const { username, status, position, employeeId, password } = body

    const user = await findOrganizationUser(id, context.organizationId)

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Don't allow modifying the main admin
    if (user.role === 'admin') {
      return NextResponse.json(
        { error: 'Cannot modify admin users through this endpoint' },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = {}
    const profileUpdates: Record<string, unknown> = {}

    // Update username
    if (username && typeof username === 'string' && username.trim()) {
      // Check if username is taken by another user (usernames are globally unique)
      const existing = await db.user.findFirst({ where: { username: username.trim(), NOT: { id } } })
      if (existing) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 })
      }
      updates.username = username.trim()
    }

    if (status && ['active', 'suspended', 'archived'].includes(status)) {
      updates.status = status
    }

    if (position) {
      profileUpdates.position = position
    }

    // Update employee ID
    if (employeeId && typeof employeeId === 'string' && employeeId.trim()) {
      const existingCanonical = await db.reportingEmployee.findFirst({
        where: { organizationId: context.organizationId, employeeCode: employeeId.trim(), membership: { userId: { not: id } } },
      })
      const existing = !existingCanonical
        ? await db.employeeProfile.findFirst({ where: { employeeId: employeeId.trim(), user: { organizationId: context.organizationId }, NOT: { userId: id } } })
        : null
      if (existingCanonical || existing) {
        return NextResponse.json({ error: 'Employee ID is already taken' }, { status: 409 })
      }
      profileUpdates.employeeId = employeeId.trim()
    }

    if (password) {
      updates.passwordHash = await hashPassword(password)
      // Session revocation (Task 23 audit): an admin-set password reset must
      // invalidate the employee's existing sessions, same guarantee as the
      // password-reset approval flow.
      updates.tokenVersion = { increment: 1 }
    }

    // Update user
    if (Object.keys(updates).length > 0) {
      await db.user.update({
        where: { id },
        data: updates,
      })
    }

    // Update profile
    if (Object.keys(profileUpdates).length > 0 && user.profile) {
      await db.employeeProfile.update({
        where: { userId: id },
        data: profileUpdates,
      })
    }

    const canonicalEmployee = await db.reportingEmployee.findFirst({
      where: { organizationId: context.organizationId, membership: { userId: id } },
    })
    if (canonicalEmployee) {
      const canonicalPosition = position
        ? await db.reportingPosition.upsert({
            where: { organizationId_code: { organizationId: context.organizationId, code: position.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') } },
            update: { name: position },
            create: { organizationId: context.organizationId, name: position, code: position.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') },
          })
        : null
      await db.reportingEmployee.update({
        where: { id: canonicalEmployee.id },
        data: {
          ...(username ? { displayName: username.trim() } : {}),
          ...(employeeId ? { employeeCode: employeeId.trim() } : {}),
          ...(status ? { status } : {}),
          ...(canonicalPosition ? { positionId: canonicalPosition.id } : {}),
        },
      })
    }

    await db.saaSAuditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: payload.userId,
        action: 'employee_updated',
        resourceType: 'reporting_employee',
        resourceId: canonicalEmployee?.id ?? id,
        metadata: JSON.parse(JSON.stringify({ targetUserId: id, updates, profileUpdates })),
      },
    })

    const updatedUser = await db.user.findUnique({
      where: { id },
      include: { profile: true },
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Update employee error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/employees/[id] - Delete employee
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { id } = await params

    const user = await findOrganizationUser(id, context.organizationId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.role === 'admin') {
      return NextResponse.json(
        { error: 'Cannot delete admin users' },
        { status: 400 }
      )
    }

    const canonicalEmployee = await db.reportingEmployee.findFirst({
      where: { organizationId: context.organizationId, membership: { userId: id } },
      select: { id: true, membershipId: true },
    })
    if (canonicalEmployee) {
      await db.reportingEmployee.delete({ where: { id: canonicalEmployee.id } })
      await db.saaSOrganizationMembership.delete({ where: { id: canonicalEmployee.membershipId } })
    }
    await db.user.delete({ where: { id } })

    await db.saaSAuditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: payload.userId,
        action: 'employee_deleted',
        resourceType: 'reporting_employee',
        resourceId: canonicalEmployee?.id ?? id,
        metadata: { targetUserId: id, username: user.username },
      },
    })

    return NextResponse.json({ message: 'Employee deleted successfully' })
  } catch (error) {
    console.error('Delete employee error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
