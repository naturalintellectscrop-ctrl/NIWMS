import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { db } from '@/lib/db'

// The admin dashboard consumes a stable API contract:
//   missingTodayReports: { id, username, profile? }
//   recentReports:       DailyReport-shaped rows with `user`
// The canonical reporting models store identity via membership.userId, so
// this route normalizes them (with a batched user lookup) into that contract.
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response
    const today = new Date().toISOString().split('T')[0]
    const currentMonth = today.substring(0, 7)
    const base = { organizationId: context.organizationId }
    const employees = await db.reportingEmployee.findMany({
      where: { ...base, status: 'active' },
      include: { membership: true, position: true },
    })
    // 7-day reporting trend window (zero-filled so the UI can render honest gaps)
    const trendDays = 7
    const trend: { date: string; count: number }[] = []
    const trendStart = new Date(`${today}T00:00:00Z`)
    for (let offset = trendDays - 1; offset >= 0; offset--) {
      const day = new Date(trendStart)
      day.setUTCDate(day.getUTCDate() - offset)
      trend.push({ date: day.toISOString().split('T')[0], count: 0 })
    }
    const trendIndex = new Map(trend.map((entry) => [entry.date, entry]))

    const [totalReports, todayReports, monthReports, recentRows, trendRows] = await Promise.all([
      db.reportingDailyReport.count({ where: base }),
      db.reportingDailyReport.count({ where: { ...base, reportDate: today } }),
      db.reportingDailyReport.count({ where: { ...base, reportDate: { startsWith: currentMonth } } }),
      db.reportingDailyReport.findMany({
        where: base,
        take: 10,
        include: { employee: { include: { position: true, membership: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.reportingDailyReport.findMany({
        where: { ...base, reportDate: { gte: trend[0].date, lte: today } },
        select: { reportDate: true },
      }),
    ])
    for (const row of trendRows) {
      const entry = trendIndex.get(row.reportDate)
      if (entry) entry.count += 1
    }
    const submittedToday = new Set((await db.reportingDailyReport.findMany({ where: { ...base, reportDate: today }, select: { employeeId: true } })).map((row) => row.employeeId))

    const relatedUserIds = [
      ...new Set([
        ...employees.map((employee) => employee.membership?.userId).filter((id): id is string => Boolean(id)),
        ...recentRows.map((report) => report.employee.membership?.userId).filter((id): id is string => Boolean(id)),
      ]),
    ]
    const relatedUsers = await db.user.findMany({
      where: { id: { in: relatedUserIds } },
      select: { id: true, username: true, role: true, status: true },
    })
    const usersById = new Map(relatedUsers.map((user) => [user.id, user]))

    const profileFor = (employee: { employeeCode: string; displayName: string; position?: { name: string } | null }) => ({
      employeeId: employee.employeeCode,
      position: employee.position?.name ?? null,
    })
    const userFor = (userId: string | null | undefined, fallbackName: string) => {
      const user = userId ? usersById.get(userId) : undefined
      return {
        id: user?.id ?? userId ?? fallbackName,
        username: user?.username ?? fallbackName,
        role: user?.role ?? 'employee',
        status: user?.status ?? 'active',
      }
    }

    const missingTodayReports = employees
      .filter((employee) => !submittedToday.has(employee.id))
      .map((employee) => ({
        ...userFor(employee.membership?.userId, employee.displayName),
        id: employee.id,
        profile: profileFor(employee),
      }))
    const recentReports = recentRows.map((report) => ({
      id: report.id,
      userId: report.employee.membership?.userId ?? report.employee.id,
      date: report.reportDate,
      activityText: report.activityText,
      location: report.location,
      timeIn: report.timeIn,
      timeOut: report.timeOut,
      comments: report.comments,
      createdAt: report.createdAt.toISOString(),
      user: {
        ...userFor(report.employee.membership?.userId, report.employee.displayName),
        profile: profileFor(report.employee),
      },
    }))
    // Active employees grouped by position (highest headcount first)
    const positionCounts = new Map<string, number>()
    for (const employee of employees) {
      const positionName = employee.position?.name ?? 'Unassigned'
      positionCounts.set(positionName, (positionCounts.get(positionName) ?? 0) + 1)
    }
    const positionBreakdown = Array.from(positionCounts.entries())
      .map(([position, count]) => ({ position, count }))
      .sort((a, b) => b.count - a.count || a.position.localeCompare(b.position))

    // Top reporters for the current month (real per-employee submission counts)
    const monthRows = await db.reportingDailyReport.findMany({
      where: { ...base, reportDate: { startsWith: currentMonth } },
      select: { employeeId: true, reportDate: true },
    })
    const monthByEmployee = new Map<string, { count: number; lastDate: string }>()
    for (const row of monthRows) {
      const entry = monthByEmployee.get(row.employeeId)
      if (entry) {
        entry.count += 1
        if (row.reportDate > entry.lastDate) entry.lastDate = row.reportDate
      } else {
        monthByEmployee.set(row.employeeId, { count: 1, lastDate: row.reportDate })
      }
    }
    const employeesById = new Map(employees.map((employee) => [employee.id, employee]))
    const topReporters = Array.from(monthByEmployee.entries())
      .map(([employeeId, entry]) => {
        const employee = employeesById.get(employeeId)
        const user = employee?.membership?.userId ? usersById.get(employee.membership.userId) : undefined
        return {
          username: user?.username ?? employee?.displayName ?? 'Unknown employee',
          position: employee?.position?.name ?? 'Unassigned',
          count: entry.count,
          lastDate: entry.lastDate,
        }
      })
      .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
      .slice(0, 5)

    return NextResponse.json({
      totalEmployees: employees.length,
      activeEmployees: employees.length,
      suspendedEmployees: await db.reportingEmployee.count({ where: { ...base, status: 'suspended' } }),
      totalReports,
      todayReports,
      monthReports,
      currentMonth,
      today,
      positionBreakdown,
      topReporters,
      reportsTrend: trend,
      missingTodayReports,
      recentReports,
    })
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
