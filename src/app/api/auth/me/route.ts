import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'

// GET /api/auth/me
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const context = payload.role === 'super_admin' ? null : await getTenantContext(payload)
    if (!context && payload.role !== 'super_admin') {
      return NextResponse.json({ error: 'Active organization membership required' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: payload.userId },
      include: { profile: true },
    })

    if (!user || user.status !== 'active') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Server-derived organization identity for the workspace shell.
    const organization = context?.organizationId
      ? await db.saaSOrganization.findUnique({ where: { id: context.organizationId }, select: { name: true, reportDeadline: true, organizationType: true } })
      : undefined

    return NextResponse.json({
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      organizationId: context?.organizationId ?? undefined,
      organizationName: organization?.name ?? undefined,
      organizationType: organization ? (organization.organizationType === 'LEGACY' ? 'LEGACY' : 'SAAS') : undefined,
      reportDeadline: organization?.reportDeadline ?? undefined,
      membershipId: context?.membershipId ?? undefined,
      organizationRole: context?.organizationRole ?? undefined,
      createdAt: user.createdAt,
      mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt,
      profile: user.profile ? {
        employeeId: user.profile.employeeId,
        position: user.profile.position,
      } : null,
    })
  } catch (error) {
    console.error('Auth me error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
