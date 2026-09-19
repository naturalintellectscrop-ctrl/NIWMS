/**
 * Canonical SaaS reporting service.
 *
 * Reporting data is scoped by the canonical organization and reporting employee
 * records. Legacy Organization/DailyReport tables are intentionally not used.
 */

import { db } from '@/lib/db'
import { DEFAULT_CATEGORIES, generateMonthlyReport, processMonthlyActivities, type MonthlyReportOutput } from '@/lib/report-engine'

export interface GenerateReportParams {
  organizationId: string
  userId: string
  month: string
  force?: boolean
  generatedBy?: string
}

export interface GenerateReportResult {
  report: MonthlyReportOutput
  dbRecord: {
    id: string
    status: string
    generatedBy: string | null
    createdAt: Date
    updatedAt: Date
    originalCreatedAt: Date | null
    lastRegeneratedAt: Date | null
    regeneratedBy: string | null
    regenerationCount: number
  }
  isRegeneration: boolean
}

export async function generateReport(params: GenerateReportParams): Promise<GenerateReportResult> {
  const { organizationId, userId, month, force = false, generatedBy = userId } = params
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month parameter is required (YYYY-MM format)')

  const employee = await db.reportingEmployee.findFirst({
    where: { organizationId, membership: { userId, status: 'active' }, status: 'active' },
    include: { membership: true, position: true },
  })
  if (!employee) throw new Error('Employee not found')

  const existing = await db.reportingMonthlyReport.findUnique({
    where: { employeeId_month: { employeeId: employee.id, month } },
  })
  if (existing && !force) {
    const error = new Error('Monthly report already exists for this period. Use force=true to regenerate.') as Error & { existingReportId?: string }
    error.existingReportId = existing.id
    throw error
  }

  const dailyReports = await db.reportingDailyReport.findMany({
    where: { organizationId, employeeId: employee.id, reportDate: { startsWith: month } },
    orderBy: { reportDate: 'asc' },
  })
  if (dailyReports.length === 0) throw new Error('No daily reports found for this month')

  const processedData = processMonthlyActivities(
    dailyReports.map((report) => ({
      date: report.reportDate,
      activityText: report.activityText,
      createdAt: report.createdAt.toISOString(),
      location: report.location,
      timeIn: report.timeIn,
      timeOut: report.timeOut,
      comments: report.comments,
    })),
    month,
    DEFAULT_CATEGORIES,
  )
  const report = generateMonthlyReport({
    employeeName: employee.displayName,
    employeeId: employee.employeeCode,
    position: employee.position?.name || 'N/A',
    month,
    processedData,
  })
  const isRegeneration = Boolean(existing)

  const saved = existing
    ? await db.reportingMonthlyReport.update({
        where: { id: existing.id },
        data: {
          reportData: JSON.parse(JSON.stringify(report)),
          totalReports: processedData.statistics.totalReportsSubmitted,
          totalActivities: processedData.statistics.totalActivitiesRecorded,
          submissionRate: processedData.statistics.submissionRate,
          categoryBreakdown: JSON.parse(JSON.stringify(processedData.categoryBreakdown)),
          summary: report.summary,
          achievements: report.achievements,
          status: 'generated',
          generatedByUserId: generatedBy,
          lastRegeneratedAt: new Date(),
          regeneratedByUserId: generatedBy,
          regenerationCount: { increment: 1 },
        },
      })
      : await db.reportingMonthlyReport.create({
        data: {
          organizationId,
          employeeId: employee.id,
          month,
          reportData: JSON.parse(JSON.stringify(report)),
          totalReports: processedData.statistics.totalReportsSubmitted,
          totalActivities: processedData.statistics.totalActivitiesRecorded,
          submissionRate: processedData.statistics.submissionRate,
          categoryBreakdown: JSON.parse(JSON.stringify(processedData.categoryBreakdown)),
          summary: report.summary,
          achievements: report.achievements,
          status: 'generated',
          generatedByUserId: generatedBy,
          originalCreatedAt: new Date(),
        },
      })

  await db.saaSAuditLog.create({
    data: {
      organizationId,
      actorUserId: generatedBy,
      action: isRegeneration ? 'monthly_report_regenerated' : 'monthly_report_generated',
      resourceType: 'reporting_monthly_report',
      resourceId: saved.id,
      metadata: { month, employeeId: employee.id, isRegeneration },
    },
  })

  return {
    report,
    dbRecord: {
      id: saved.id,
      status: saved.status,
      generatedBy: saved.generatedByUserId,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      originalCreatedAt: saved.originalCreatedAt,
      lastRegeneratedAt: saved.lastRegeneratedAt,
      regeneratedBy: saved.regeneratedByUserId,
      regenerationCount: saved.regenerationCount,
    },
    isRegeneration,
  }
}

export async function generateBulkReports(params: {
  organizationId: string
  month: string
  userIds: string[]
  generatedBy: string
}): Promise<{ userId: string; username: string; success: boolean; reportId?: string; error?: string }[]> {
  const results: { userId: string; username: string; success: boolean; reportId?: string; error?: string }[] = []
  for (const userId of params.userIds) {
    const membership = await db.saaSOrganizationMembership.findFirst({
      where: { organizationId: params.organizationId, userId, status: 'active' },
    })
    try {
      const result = await generateReport({ ...params, userId, force: true })
      results.push({ userId, username: userId, success: true, reportId: result.dbRecord.id })
    } catch (error) {
      results.push({ userId, username: membership?.userId || userId, success: false, error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
  return results
}
