import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import ExcelJS from 'exceljs'
import { requireOrganizationAdmin } from '@/lib/tenant'

// Helper: authenticate admin
async function authenticateAdmin(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

// GET /api/admin/export - Export monthly reports to Excel
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // YYYY-MM format

    if (!month) {
      return NextResponse.json(
        { error: 'Month parameter is required (YYYY-MM format)' },
        { status: 400 }
      )
    }

    // Fetch all reports for the month with user data
    const reports = await db.reportingDailyReport.findMany({
      where: { organizationId: context.organizationId, reportDate: { startsWith: month } },
      include: {
        employee: {
          include: { position: true },
        },
      },
      orderBy: [
        { employee: { displayName: 'asc' } },
        { reportDate: 'asc' },
      ],
    })

    // Create audit log
    await db.saaSAuditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: payload.userId,
        action: 'report_exported',
        resourceType: 'reporting_daily_report',
        metadata: { month, reportCount: reports.length },
      },
    })

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'NIWMS Workforce Reporting'
    workbook.created = new Date()

    const BRANDED = 'FF0B1F6D'
    const GREEN = 'FF059669'

    // Group reports by user for summary
    const userReports: Record<string, typeof reports> = {}
    for (const report of reports) {
      if (!userReports[report.employeeId]) {
        userReports[report.employeeId] = []
      }
      userReports[report.employeeId].push(report)
    }

    // ══════════════════════════════════════════════════════════════
    // SHEET 1: DAILY REPORTS (Detailed — first sheet so users see data immediately)
    // ══════════════════════════════════════════════════════════════
    const detailSheet = workbook.addWorksheet('Daily Reports')
    detailSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Employee', key: 'employee', width: 20 },
      { header: 'Employee ID', key: 'employeeId', width: 14 },
      { header: 'Position', key: 'position', width: 25 },
      { header: 'Time In', key: 'timeIn', width: 10 },
      { header: 'Time Out', key: 'timeOut', width: 10 },
      { header: 'Activity Description', key: 'activity', width: 55 },
      { header: 'Location', key: 'location', width: 25 },
      { header: 'Comments / Notes', key: 'comments', width: 40 },
    ]

    for (const report of reports) {
      detailSheet.addRow({
        date: report.reportDate,
        employee: report.employee.displayName,
        employeeId: report.employee.employeeCode,
        position: report.employee.position?.name || 'N/A',
        timeIn: report.timeIn || '',
        timeOut: report.timeOut || '',
        activity: report.activityText,
        location: report.location || '',
        comments: report.comments || '',
      })
    }

    // Style detail header
    const detailHeaderRow = detailSheet.getRow(1)
    detailHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    detailHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRANDED },
    }

    // Add alternating row colors for readability
    detailSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        if (rowNumber % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FC' },
          }
        }
      }
    })

    // ══════════════════════════════════════════════════════════════
    // SHEET 2: EMPLOYEE SUMMARY
    // ══════════════════════════════════════════════════════════════
    const summarySheet = workbook.addWorksheet('Employee Summary')
    summarySheet.columns = [
      { header: 'Employee', key: 'employee', width: 20 },
      { header: 'Employee ID', key: 'employeeId', width: 14 },
      { header: 'Position', key: 'position', width: 25 },
      { header: 'Total Reports', key: 'totalReports', width: 14 },
      { header: 'First Report', key: 'firstReport', width: 14 },
      { header: 'Last Report', key: 'lastReport', width: 14 },
    ]

    // Fill summary
    for (const [userId, userReportList] of Object.entries(userReports)) {
      const firstReport = userReportList[0]
      const lastReport = userReportList[userReportList.length - 1]

      summarySheet.addRow({
        employee: firstReport.employee.displayName,
        employeeId: firstReport.employee.employeeCode,
        position: firstReport.employee.position?.name || 'N/A',
        totalReports: userReportList.length,
        firstReport: firstReport.reportDate,
        lastReport: lastReport.reportDate,
      })
    }

    // Style summary header
    const summaryHeaderRow = summarySheet.getRow(1)
    summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    summaryHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: GREEN },
    }

    // Add alternating row colors
    summarySheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        if (rowNumber % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FC' },
          }
        }
      }
    })

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Return as downloadable file
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="daily-reports-${month}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
