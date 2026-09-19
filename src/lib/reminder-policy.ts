import type { Organization } from '@prisma/client'

export const DAILY_REMINDER_TITLE = 'Daily report reminder'

export const DEFAULT_REPORT_DEADLINE = '16:00'

function deadlineMinutes(deadline: string | null | undefined): number {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((deadline ?? DEFAULT_REPORT_DEADLINE).trim())
  const hours = match ? Number(match[1]) : 16
  const minutes = match ? Number(match[2]) : 0
  return hours * 60 + minutes
}

export function getLocalReminderWindow(now: Date, timezone: string, deadline?: string | null) {
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }).format(now))
  const localMinute = Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, minute: '2-digit' }).format(now))
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const due = localHour * 60 + localMinute >= deadlineMinutes(deadline)
  return { localHour, dateKey, due }
}

export function shouldCreateReminder(input: {
  organization: Pick<Organization, 'timezone'> & {
    settings?: { reminderEnabled: boolean; reportDeadline?: string | null } | null
  }
  submitted: boolean
  existingReminder: boolean
  now?: Date
}) {
  if (input.organization.settings?.reminderEnabled === false || input.submitted || input.existingReminder) return false
  return getLocalReminderWindow(input.now ?? new Date(), input.organization.timezone, input.organization.settings?.reportDeadline).due
}
