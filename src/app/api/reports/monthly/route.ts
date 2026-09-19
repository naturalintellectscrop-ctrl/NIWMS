import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'
import { generateReport } from '@/lib/report-service'
import { checkRateLimit, getRateLimitErrorMessage } from '@/lib/rate-limiter'

// GET /api/reports/monthly - List employee's own monthly reports
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return unauthorizedResponse('Active organization membership required')

    const employee = await db.reportingEmployee.findFirst({
      where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' } },
    })
    if (!employee) return NextResponse.json([])
    const reports = await db.reportingMonthlyReport.findMany({
      where: { organizationId: tenant.organizationId, employeeId: employee.id },
      orderBy: { month: 'desc' },
    })

    const parsed = reports.map((r) => ({
      id: r.id,
      month: r.month,
      totalReports: r.totalReports,
      totalActivities: r.totalActivities,
      submissionRate: r.submissionRate,
      status: r.status,
      summary: r.summary,
      achievements: r.achievements,
      categoryBreakdown: r.categoryBreakdown,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      approvedAt: r.approvedAt,
    }))

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('List monthly reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/reports/monthly - Generate or regenerate employee's monthly report
export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return unauthorizedResponse('Active organization membership required')

    // Rate limiting
    const rateLimit = checkRateLimit(payload.userId, 'employee_generate')
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: getRateLimitErrorMessage('employee_generate') },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { month, force } = body

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Month parameter is required (YYYY-MM format)' }, { status: 400 })
    }

    try {
      // Check for existing report before deciding generatedBy/force
      let isRegeneration = false
      const employee = await db.reportingEmployee.findFirst({
        where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' } },
      })
      if (!employee) return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 })
      const existing = await db.reportingMonthlyReport.findUnique({
        where: { employeeId_month: { employeeId: employee.id, month } },
      })

      if (existing) {
        // If force not explicitly true, return the existing report info
        if (force !== true) {
          return NextResponse.json(
            {
              error: 'Monthly report already exists for this period. Use force=true to regenerate.',
              existingReportId: existing.id,
            },
            { status: 409 }
          )
        }
        isRegeneration = true
      }

      const result = await generateReport({
        organizationId: tenant.organizationId,
        userId: payload.userId,
        month,
        generatedBy: 'self',
        force: isRegeneration,
      })

      return NextResponse.json(
        {
          id: result.dbRecord.id,
          ...result.report,
          createdAt: result.dbRecord.createdAt,
          updatedAt: result.dbRecord.updatedAt,
        },
        { status: result.isRegeneration ? 200 : 201 }
      )
    } catch (error) {
      // Check if it's a "report already exists" error with existingReportId
      if (error instanceof Error && 'existingReportId' in error) {
        return NextResponse.json(
          {
            error: error.message,
            existingReportId: (error as unknown as Record<string, string>).existingReportId,
          },
          { status: 409 }
        )
      }
      throw error
    }
  } catch (error) {
    console.error('Generate monthly report error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
