import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin, forbiddenResponse } from '@/lib/auth'
import { generateReport } from '@/lib/report-service'
import { checkRateLimit, getRateLimitErrorMessage } from '@/lib/rate-limiter'
import { getTenantContext } from '@/lib/tenant'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return forbiddenResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return forbiddenResponse('Active organization membership required')
    const params = new URL(request.url).searchParams
    const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(params.get('pageSize') || '20', 10) || 20))
    const month = params.get('month')
    const employeeId = params.get('employeeId')
    const where = { organizationId: tenant.organizationId, ...(month ? { month } : {}), ...(employeeId ? { employeeId } : {}) }
    const [total, rows] = await Promise.all([
      db.reportingMonthlyReport.count({ where }),
      db.reportingMonthlyReport.findMany({ where, include: { employee: { include: { membership: true, position: true } } }, orderBy: { month: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    // Normalize to the dashboard contract: reports carry a `user` identity.
    const userIds = [...new Set(rows.map((row) => row.employee.membership?.userId).filter((id): id is string => Boolean(id)))]
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, role: true, status: true } })
      : []
    const usersById = new Map(users.map((user) => [user.id, user]))
    const reports = rows.map((row) => {
      const account = row.employee.membership?.userId ? usersById.get(row.employee.membership.userId) : undefined
      return {
        ...row,
        user: {
          id: account?.id ?? row.employee.id,
          username: account?.username ?? row.employee.displayName,
          role: account?.role ?? 'employee',
          status: account?.status ?? 'active',
          profile: {
            employeeId: row.employee.employeeCode,
            position: row.employee.position?.name ?? null,
          },
        },
      }
    })
    return NextResponse.json({ reports, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error) {
    console.error('Admin list monthly reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return forbiddenResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return forbiddenResponse('Active organization membership required')
    const body = await request.json()
    const { month, userId, force } = body
    if (!/^\d{4}-\d{2}$/.test(month || '')) return NextResponse.json({ error: 'Month parameter is required (YYYY-MM format)' }, { status: 400 })
    if (!userId) return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    const membership = await db.saaSOrganizationMembership.findFirst({ where: { organizationId: tenant.organizationId, userId, status: 'active' } })
    if (!membership) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    const rateLimit = checkRateLimit(payload.userId, 'admin_generate')
    if (!rateLimit.allowed) return NextResponse.json({ error: getRateLimitErrorMessage('admin_generate') }, { status: 429 })
    try {
      const result = await generateReport({ organizationId: tenant.organizationId, userId, month, generatedBy: payload.userId, force: force === true })
      return NextResponse.json({ id: result.dbRecord.id, ...result.report, status: result.dbRecord.status, generatedBy: result.dbRecord.generatedBy, createdAt: result.dbRecord.createdAt, updatedAt: result.dbRecord.updatedAt }, { status: result.isRegeneration ? 200 : 201 })
    } catch (error) {
      if (error instanceof Error && 'existingReportId' in error) return NextResponse.json({ error: error.message, existingReportId: (error as Error & { existingReportId?: string }).existingReportId }, { status: 409 })
      throw error
    }
  } catch (error) {
    console.error('Admin generate monthly report error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
