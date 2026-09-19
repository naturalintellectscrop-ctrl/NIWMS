import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { db } from '@/lib/db'

// The admin reports view consumes the DailyReport contract (date + user).
// Canonical reporting rows are normalized into that shape here, with a
// batched user lookup for account identity.
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const month = searchParams.get('month')
    // The dashboard employee filter sends account (user) ids; accept both the
    // current `userId` param and the legacy `employeeId` spelling. (An unknown
    // id matches no employee in this org, so the result set is safely empty.)
    const employeeParam = searchParams.get('employeeId') ?? searchParams.get('userId')
    let employeeFilter: Record<string, unknown> = {}
    if (employeeParam) {
      const canonicalEmployee = await db.reportingEmployee.findUnique({ where: { id: employeeParam } })
      employeeFilter = canonicalEmployee
        ? { employeeId: employeeParam }
        : { employee: { membership: { userId: employeeParam } } }
    }
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50))
    const where = { organizationId: context.organizationId, ...(date ? { reportDate: date } : month ? { reportDate: { startsWith: month } } : {}), ...employeeFilter }
    const [rows, total] = await Promise.all([
      db.reportingDailyReport.findMany({ where, include: { employee: { include: { position: true, department: true, membership: true } } }, orderBy: { reportDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.reportingDailyReport.count({ where }),
    ])

    const userIds = [...new Set(rows.map((row) => row.employee.membership?.userId).filter((id): id is string => Boolean(id)))]
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, role: true, status: true } })
      : []
    const usersById = new Map(users.map((user) => [user.id, user]))

    const reports = rows.map((row) => {
      const user = row.employee.membership?.userId ? usersById.get(row.employee.membership.userId) : undefined
      return {
        id: row.id,
        userId: row.employee.membership?.userId ?? row.employee.id,
        date: row.reportDate,
        activityText: row.activityText,
        location: row.location,
        timeIn: row.timeIn,
        timeOut: row.timeOut,
        comments: row.comments,
        createdAt: row.createdAt.toISOString(),
        user: {
          id: user?.id ?? row.employee.id,
          username: user?.username ?? row.employee.displayName,
          role: user?.role ?? 'employee',
          status: user?.status ?? 'active',
          profile: {
            employeeId: row.employee.employeeCode,
            position: row.employee.position?.name ?? null,
          },
        },
      }
    })
    return NextResponse.json({ reports, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (error) {
    console.error('Get admin reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
