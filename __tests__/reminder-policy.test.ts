import { describe, expect, it } from 'vitest'
import { getLocalReminderWindow, shouldCreateReminder } from '@/lib/reminder-policy'

const organization = { timezone: 'Africa/Kampala', settings: { reminderEnabled: true } }

 describe('daily reminder policy', () => {
  it('uses each tenant timezone when deciding whether 4 PM has arrived', () => {
    const now = new Date('2026-09-07T13:00:00.000Z')
    expect(getLocalReminderWindow(now, 'Africa/Kampala')).toMatchObject({ localHour: 16, dateKey: '2026-09-07', due: true })
    expect(getLocalReminderWindow(now, 'America/New_York').due).toBe(false)
  })

  it('does not remind submitted employees or disabled tenants', () => {
    const now = new Date('2026-09-07T13:00:00.000Z')
    expect(shouldCreateReminder({ organization, submitted: true, existingReminder: false, now })).toBe(false)
    expect(shouldCreateReminder({ organization: { ...organization, settings: { reminderEnabled: false } }, submitted: false, existingReminder: false, now })).toBe(false)
  })

  it('is idempotent when the scheduler runs twice', () => {
    const now = new Date('2026-09-07T13:00:00.000Z')
    expect(shouldCreateReminder({ organization, submitted: false, existingReminder: false, now })).toBe(true)
    expect(shouldCreateReminder({ organization, submitted: false, existingReminder: true, now })).toBe(false)
  })
})
