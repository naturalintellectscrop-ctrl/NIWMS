/**
 * NIWMS Report Intelligence Engine — Report Generator
 *
 * Generates professional monthly reports using templates and real data only.
 *
 * RULES:
 *   - Never invent information
 *   - Never fabricate achievements
 *   - Never generate fictional outcomes
 *   - Use ONLY submitted activity data
 *   - Every claim must be traceable to a daily report
 *
 * Output sections:
 *   1. Employee Information
 *   2. Monthly Executive Summary
 *   3. Activity Statistics
 *   4. Submission Statistics
 *   5. Category Breakdown
 *   6. Key Work Areas
 *   7. Achievements
 *   8. Activity Timeline
 *   9. Manager Comments (blank)
 *   10. Approval Section (blank)
 */

import { ProcessedReportData } from './statistics'
import { extractAchievements } from './achievements'
import { format } from 'date-fns'

// ──── OUTPUT TYPES ────

export interface MonthlyReportOutput {
  // Section 1: Employee Information
  employeeInfo: {
    name: string
    employeeId: string
    position: string
    reportingMonth: string
    reportingMonthLabel: string
  }

  // Section 2: Executive Summary
  summary: string
  dominantFocus: string | null

  // Section 3 & 4: Statistics
  statistics: {
    // Submission
    totalReportsSubmitted: number
    expectedReports: number
    submissionRate: number
    missedSubmissions: number
    longestStreak: number
    currentStreak: number

    // Activity
    totalActivities: number
    avgActivitiesPerDay: number
    avgWordsPerReport: number
    totalWords: number

    // Temporal
    mostActiveDay: string | null
    mostActiveDayCount: number
    mostActiveWeek: string | null
    mostActiveWeekCount: number

    // Category
    categoriesWorked: number
    topCategory: string
    mostFrequentCategory: string
    top3Categories: { name: string; count: number; percentage: number }[]
  }

  // Section 5: Category Breakdown
  categoryBreakdown: {
    category: string
    description: string
    count: number
    percentage: number
  }[]

  // Section 6: Key Work Areas
  keyWorkAreas: string[]
  focusAreas: string[]

  // Section 7: Achievements
  achievements: string[]

  // Section 8: Activity Timeline
  activityTimeline: {
    date: string
    dateLabel: string
    activities: string[]
    primaryCategory: string
    location?: string | null
    timeIn?: string | null
    timeOut?: string | null
    comments?: string | null
  }[]

  // Section 9: Manager Comments (blank, editable)
  managerNotes: string
  managerRating: string

  // Section 10: Approval (blank)
  approvedBy: string | null
  approvedAt: string | null

  // Meta
  status: string
  engineVersion: string
}

// ──── INTERNAL HELPERS ────

function capitalizeFirst(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return format(new Date(year, mon - 1, 1), 'MMMM yyyy')
}

function formatDateLabel(dateStr: string): string {
  return format(new Date(dateStr + 'T00:00:00'), 'MMM d, yyyy')
}

// ──── SUMMARY ENGINE ────

function generateExecutiveSummary(
  employeeName: string,
  position: string,
  data: ProcessedReportData,
  monthLabel: string
): string {
  const { statistics, topCategories, dominantFocusArea, categoryBreakdown } = data

  // Build category list
  const catNames = topCategories.map((c) => c.categoryName)
  let categoryText: string
  if (catNames.length === 0) {
    categoryText = 'various operational tasks'
  } else if (catNames.length === 1) {
    categoryText = catNames[0]
  } else if (catNames.length === 2) {
    categoryText = `${catNames[0]} and ${catNames[1]}`
  } else {
    categoryText = `${catNames.slice(0, -1).join(', ')}, and ${catNames[catNames.length - 1]}`
  }

  // Build focus text
  const focusText = dominantFocusArea || 'general operational activities'

  // Build submission assessment
  let submissionAssessment: string
  if (statistics.submissionRate >= 90) {
    submissionAssessment = 'demonstrated excellent reporting consistency'
  } else if (statistics.submissionRate >= 70) {
    submissionAssessment = 'maintained good reporting consistency'
  } else if (statistics.submissionRate >= 50) {
    submissionAssessment = 'showed moderate reporting consistency'
  } else {
    submissionAssessment = 'requires improvement in reporting consistency'
  }

  const summary =
    `During ${monthLabel}, ${employeeName} (${position}) contributed to operational activities. ` +
    `Primary work areas included ${categoryText}. ` +
    `Activities were predominantly focused on ${focusText.toLowerCase()}. ` +
    `The employee completed ${statistics.totalActivitiesRecorded} recorded activities across ${categoryBreakdown.length} categories ` +
    `and ${submissionAssessment} with a submission rate of ${statistics.submissionRate}% ` +
    `(${statistics.totalReportsSubmitted} of ${statistics.expectedReports} working days).` +
    (statistics.missedSubmissions > 0
      ? ` ${statistics.missedSubmissions} working day(s) had no report submitted.`
      : '') +
    (statistics.longestStreak >= 5
      ? ` The employee maintained a consecutive submission streak of ${statistics.longestStreak} days.`
      : '')

  return summary
}

// ──── KEY WORK AREAS ENGINE ────

function generateKeyWorkAreas(data: ProcessedReportData): string[] {
  const areas: string[] = []

  for (let i = 0; i < Math.min(data.topCategories.length, 5); i++) {
    const cat = data.topCategories[i]
    areas.push(
      `${cat.categoryName} — ${cat.count} activities (${cat.percentage}% of total work)`
    )
  }

  return areas
}

function generateFocusAreas(data: ProcessedReportData): string[] {
  return data.topCategories.map((c) =>
    `${c.categoryName} (${c.count} activities, ${c.percentage}% of total work)`
  )
}

// ──── ACTIVITY TIMELINE ENGINE ────

function generateActivityTimeline(data: ProcessedReportData): MonthlyReportOutput['activityTimeline'] {
  const grouped: Record<string, { activities: string[]; primaryCategory: string; location?: string | null; timeIn?: string | null; timeOut?: string | null; comments?: string | null }> = {}

  for (const a of data.activities) {
    if (!grouped[a.date]) {
      grouped[a.date] = { activities: [], primaryCategory: '', location: a.location, timeIn: a.timeIn, timeOut: a.timeOut, comments: a.comments }
    }
    grouped[a.date].activities.push(a.activityText)
    if (a.primaryCategory && !grouped[a.date].primaryCategory) {
      grouped[a.date].primaryCategory = a.primaryCategory.name
    }
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entryData]) => ({
      date,
      dateLabel: formatDateLabel(date),
      activities: entryData.activities,
      primaryCategory: entryData.primaryCategory || 'General',
      location: entryData.location,
      timeIn: entryData.timeIn,
      timeOut: entryData.timeOut,
      comments: entryData.comments,
    }))
}

// ──── MAIN GENERATOR ────

export function generateMonthlyReport(params: {
  employeeName: string
  employeeId: string
  position: string
  month: string
  processedData: ProcessedReportData
}): MonthlyReportOutput {
  const {
    employeeName, employeeId, position, month, processedData: data,
  } = params
  const monthLabel = formatMonthLabel(month)
  const stats = data.statistics

  return {
    // Section 1
    employeeInfo: {
      name: employeeName,
      employeeId,
      position,
      reportingMonth: month,
      reportingMonthLabel: monthLabel,
    },

    // Section 2
    summary: generateExecutiveSummary(employeeName, position, data, monthLabel),
    dominantFocus: data.dominantFocusArea,

    // Section 3 & 4
    statistics: {
      totalReportsSubmitted: stats.totalReportsSubmitted,
      expectedReports: stats.expectedReports,
      submissionRate: stats.submissionRate,
      missedSubmissions: stats.missedSubmissions,
      longestStreak: stats.longestStreak,
      currentStreak: stats.currentStreak,
      totalActivities: stats.totalActivitiesRecorded,
      avgActivitiesPerDay: stats.avgActivitiesPerDay,
      avgWordsPerReport: stats.avgWordsPerReport,
      totalWords: stats.totalWords,
      mostActiveDay: stats.mostActiveDay,
      mostActiveDayCount: stats.mostActiveDayCount,
      mostActiveWeek: stats.mostActiveWeek,
      mostActiveWeekCount: stats.mostActiveWeekCount,
      categoriesWorked: stats.categoriesWorked,
      topCategory: stats.topCategory,
      mostFrequentCategory: stats.mostFrequentCategory,
      top3Categories: stats.top3Categories,
    },

    // Section 5
    categoryBreakdown: data.categoryBreakdown.map((c) => ({
      category: c.categoryName,
      description: c.description,
      count: c.count,
      percentage: c.percentage,
    })),

    // Section 6
    keyWorkAreas: generateKeyWorkAreas(data),
    focusAreas: generateFocusAreas(data),

    // Section 7 — Uses dedicated achievement extraction module
    achievements: extractAchievements(data),

    // Section 8
    activityTimeline: generateActivityTimeline(data),

    // Section 9
    managerNotes: '',
    managerRating: '',

    // Section 10
    approvedBy: null,
    approvedAt: null,

    // Meta
    status: 'generated',
    engineVersion: '2.1.0',
  }
}
