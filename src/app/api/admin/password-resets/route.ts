import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTokenFromRequest, verifyToken } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'

// GET /api/admin/password-resets — list all reset requests
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'

    // Users linked to this organization: legacy User.organizationId, or an
    // active canonical SaaS membership. (User has no Prisma relation to the
    // SaaS membership table, so resolve the id set directly.)
    const [legacyUsers, saasMemberships] = await Promise.all([
      db.user.findMany({ where: { organizationId: context.organizationId }, select: { id: true } }),
      db.saaSOrganizationMembership.findMany({ where: { organizationId: context.organizationId, status: 'active' }, select: { userId: true } }),
    ])
    const orgUserIds = [...new Set([...legacyUsers.map((u) => u.id), ...saasMemberships.map((m) => m.userId)])]

    const requests = await db.passwordResetRequest.findMany({
      where: { ...(status !== 'all' ? { status } : {}), userId: { in: orgUserIds } },
      include: {
        user: {
          select: {
            profile: { select: { employeeId: true, position: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Count pending
    const pendingCount = await db.passwordResetRequest.count({
      where: { status: 'pending', userId: { in: orgUserIds } },
    })

    return NextResponse.json({ requests, pendingCount })
  } catch (error) {
    console.error('Get password resets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
