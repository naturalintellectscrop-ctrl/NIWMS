/**
 * Tests for Report Generation and Statistics Processing
 */

import { describe, it, expect } from 'vitest'
import { processMonthlyActivities } from '@/lib/report-engine/statistics'
import { generateMonthlyReport } from '@/lib/report-engine/generator'
import { DEFAULT_CATEGORIES } from '@/lib/report-engine/categories'
import { type DailyActivity } from '@/lib/report-engine/statistics'

describe('Statistics Processing', () => {
  function createDailyReports(overrides: Partial<DailyActivity>[] = []): DailyActivity[] {
    const defaults: DailyActivity[] = [
      { date: '2025-01-06', activityText: 'Installed editing software on production computers\nConfigured network settings', createdAt: '2025-01-06T10:00:00Z' },
      { date: '2025-01-07', activityText: 'Resolved connectivity issues for staff\nAssisted users with login problems', createdAt: '2025-01-07T09:00:00Z' },
      { date: '2025-01-08', activityText: 'Attended training workshop on cybersecurity', createdAt: '2025-01-08T11:00:00Z' },
      { date: '2025-01-09', activityText: 'Performed maintenance on office equipment\nReplaced broken printer parts', createdAt: '2025-01-09T08:30:00Z' },
      { date: '2025-01-10', activityText: 'Conducted research on new software tools', createdAt: '2025-01-10T14:00:00Z' },
    ]
    return overrides.length > 0
      ? overrides.map((override, index) => ({ ...defaults[index % defaults.length], ...override }))
      : defaults
  }

  it('should process monthly activities correctly', () => {
    const result = processMonthlyActivities(createDailyReports(), '2025-01', DEFAULT_CATEGORIES)
    
    expect(result.activities.length).toBeGreaterThan(0)
    expect(result.statistics.totalReportsSubmitted).toBe(5)
    expect(result.statistics.totalActivitiesRecorded).toBeGreaterThan(5) // Multi-activity entries split
    expect(result.categoryBreakdown.length).toBeGreaterThan(0)
  })

  it('should calculate submission rate correctly', () => {
    const result = processMonthlyActivities(createDailyReports(), '2025-01', DEFAULT_CATEGORIES)
    
    // January 2025 has 23 working days
    expect(result.statistics.expectedReports).toBe(23)
    expect(result.statistics.submissionRate).toBe(Math.round((5 / 23) * 100))
    expect(result.statistics.missedSubmissions).toBe(18)
  })

  it('should handle empty reports', () => {
    const result = processMonthlyActivities([], '2025-01', DEFAULT_CATEGORIES)
    
    expect(result.activities).toHaveLength(0)
    expect(result.statistics.totalReportsSubmitted).toBe(0)
    expect(result.statistics.totalActivitiesRecorded).toBe(0)
    expect(result.statistics.submissionRate).toBe(0)
    expect(result.categoryBreakdown).toHaveLength(0)
  })

  it('should deduplicate activities', () => {
    const reports: DailyActivity[] = [
      { date: '2025-01-06', activityText: 'Installed software', createdAt: '2025-01-06T10:00:00Z' },
      { date: '2025-01-07', activityText: 'Installed software', createdAt: '2025-01-07T10:00:00Z' }, // Duplicate
    ]
    const result = processMonthlyActivities(reports, '2025-01', DEFAULT_CATEGORIES)
    
    // After dedup, only 1 unique activity text
    expect(result.activities.length).toBe(1)
  })

  it('should split multi-line activities', () => {
    const reports: DailyActivity[] = [
      { date: '2025-01-06', activityText: 'Installed software\nConfigured network\nUpdated systems', createdAt: '2025-01-06T10:00:00Z' },
    ]
    const result = processMonthlyActivities(reports, '2025-01', DEFAULT_CATEGORIES)
    
    expect(result.activities.length).toBe(3)
  })

  it('should detect most active day', () => {
    const result = processMonthlyActivities(createDailyReports(), '2025-01', DEFAULT_CATEGORIES)
    
    expect(result.statistics.mostActiveDay).not.toBeNull()
    expect(result.statistics.mostActiveDayCount).toBeGreaterThan(0)
  })

  it('should calculate streaks correctly', () => {
    const reports: DailyActivity[] = [
      { date: '2025-01-06', activityText: 'Task A', createdAt: '2025-01-06T10:00:00Z' },
      { date: '2025-01-07', activityText: 'Task B', createdAt: '2025-01-07T10:00:00Z' },
      { date: '2025-01-08', activityText: 'Task C', createdAt: '2025-01-08T10:00:00Z' },
      { date: '2025-01-09', activityText: 'Task D', createdAt: '2025-01-09T10:00:00Z' },
    ]
    const result = processMonthlyActivities(reports, '2025-01', DEFAULT_CATEGORIES)
    
    expect(result.statistics.longestStreak).toBe(4)
  })

  it('should identify recurring tasks', () => {
    const reports: DailyActivity[] = [
      { date: '2025-01-06', activityText: 'Provided technical support to various staff members in the office', createdAt: '2025-01-06T10:00:00Z' },
      { date: '2025-01-07', activityText: 'Provided technical support to various management team leaders', createdAt: '2025-01-07T10:00:00Z' },
      { date: '2025-01-08', activityText: 'Provided technical support to various external client representatives', createdAt: '2025-01-08T10:00:00Z' },
    ]
    const result = processMonthlyActivities(reports, '2025-01', DEFAULT_CATEGORIES)
    
    expect(result.recurringTasks.length).toBeGreaterThan(0)
  })

  it('should detect dominant focus area', () => {
    const reports: DailyActivity[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2025-01-${String(6 + i).padStart(2, '0')}`,
      activityText: `Installed new software package ${i + 1} on workstation`,
      createdAt: `2025-01-${String(6 + i).padStart(2, '0')}T10:00:00Z`,
    }))
    const result = processMonthlyActivities(reports, '2025-01', DEFAULT_CATEGORIES)
    
    expect(result.dominantFocusArea).not.toBeNull()
    expect(result.dominantFocusArea).toContain('Software Installation')
  })
})

describe('Report Generation', () => {
  it('should generate a complete report with all 10 sections', () => {
    const reports: DailyActivity[] = [
      { date: '2025-01-06', activityText: 'Installed editing software\nConfigured production computers', createdAt: '2025-01-06T10:00:00Z' },
      { date: '2025-01-07', activityText: 'Resolved connectivity issues', createdAt: '2025-01-07T09:00:00Z' },
    ]
    
    const processed = processMonthlyActivities(reports, '2025-01', DEFAULT_CATEGORIES)
    const report = generateMonthlyReport({
      employeeName: 'John Doe',
      employeeId: 'EMP-001',
      position: 'Technician',
      month: '2025-01',
      processedData: processed,
    })

    // Section 1: Employee Info
    expect(report.employeeInfo.name).toBe('John Doe')
    expect(report.employeeInfo.employeeId).toBe('EMP-001')
    expect(report.employeeInfo.reportingMonth).toBe('2025-01')
    expect(report.employeeInfo.reportingMonthLabel).toBe('January 2025')

    // Section 2: Summary
    expect(report.summary).toBeTruthy()
    expect(report.summary.length).toBeGreaterThan(50)

    // Section 3 & 4: Statistics
    expect(report.statistics.totalReportsSubmitted).toBe(2)
    expect(report.statistics.submissionRate).toBeGreaterThan(0)

    // Section 5: Category Breakdown
    expect(report.categoryBreakdown.length).toBeGreaterThan(0)

    // Section 6: Key Work Areas
    expect(report.keyWorkAreas.length).toBeGreaterThan(0)

    // Section 7: Achievements
    expect(report.achievements.length).toBeGreaterThan(0)

    // Section 8: Activity Timeline
    expect(report.activityTimeline.length).toBe(2)
    expect(report.activityTimeline[0].date).toBe('2025-01-06')

    // Section 9 & 10: Blank
    expect(report.managerNotes).toBe('')
    expect(report.approvedBy).toBeNull()

    // Meta
    expect(report.engineVersion).toBe('2.1.0')
    expect(report.status).toBe('generated')
  })

  it('should generate achievements from patterns (not just relabeled activities)', () => {
    const reports: DailyActivity[] = Array.from({ length: 22 }, (_, i) => ({
      date: `2025-01-${String(2 + i).padStart(2, '0')}`,
      activityText: `Completed ${i + 1} technical support tasks for the day`,
      createdAt: `2025-01-${String(2 + i).padStart(2, '0')}T10:00:00Z`,
    }))
    
    const processed = processMonthlyActivities(reports, '2025-01', DEFAULT_CATEGORIES)
    const report = generateMonthlyReport({
      employeeName: 'Jane Smith',
      employeeId: 'EMP-002',
      position: 'Support Engineer',
      month: '2025-01',
      processedData: processed,
    })

    // Achievements should NOT be raw activity text
    // They should be pattern-based descriptions
    for (const achievement of report.achievements) {
      // Should not be "Completed 1 technical support tasks for the day."
      expect(achievement).not.toMatch(/^Completed \d+ technical support tasks/)
    }
  })

  it('should handle empty activity data gracefully', () => {
    const processed = processMonthlyActivities([], '2025-01', DEFAULT_CATEGORIES)
    const report = generateMonthlyReport({
      employeeName: 'Empty Employee',
      employeeId: 'EMP-000',
      position: 'N/A',
      month: '2025-01',
      processedData: processed,
    })

    expect(report.statistics.totalReportsSubmitted).toBe(0)
    expect(report.categoryBreakdown).toHaveLength(0)
    expect(report.achievements).toContain('No significant achievement patterns detected.')
  })
})
