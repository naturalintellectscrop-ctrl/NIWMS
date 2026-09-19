import { describe, expect, it } from 'vitest'
import { DEFAULT_PLANS } from '@/lib/entitlements'
import { DEFAULT_CATEGORIES } from '@/lib/report-engine/categories'
import { canAccessLifecycleState, canAccessTenantResource, selectTenantMembership } from '@/lib/authorization'
import { getLocalReminderWindow, shouldCreateReminder } from '@/lib/reminder-policy'

describe('certification gap regressions', () => {
  it('defines the commercial plan employee boundaries', () => {
    expect(DEFAULT_PLANS.map((plan) => [plan.key, plan.maxEmployees])).toEqual([
      ['starter', 10],
      ['business', 30],
      ['professional', 75],
      ['enterprise', null],
    ])
  })

  it('covers every required reporting category', () => {
    const names = new Set(DEFAULT_CATEGORIES.map((category) => category.name))
    for (const name of [
      'Technical Support', 'Software Installation', 'Networking', 'Administration',
      'Production Support', 'Data Management', 'Communication', 'Security',
      'Training', 'Research', 'Maintenance',
    ]) expect(names.has(name)).toBe(true)
  })

  it('rejects tenant identifiers supplied by an authenticated client', () => {
    const membership = selectTenantMembership([{ organizationId: 'org-a', role: 'member', status: 'active' }], 'org-b')
    expect(membership).toBeNull()
    expect(canAccessTenantResource('org-a', 'org-b')).toBe(false)
  })

  it('blocks protected lifecycle states', () => {
    for (const status of ['suspended', 'cancelled', 'archived', 'pending_deletion', 'deleted']) {
      expect(canAccessLifecycleState(status)).toBe(false)
    }
    expect(canAccessLifecycleState('trial')).toBe(true)
    expect(canAccessLifecycleState('active')).toBe(true)
    expect(canAccessLifecycleState('grace')).toBe(true)
  })

  it('is deterministic for tenant-local reminder decisions', () => {
    const now = new Date('2026-09-07T13:00:00.000Z')
    const organization = { timezone: 'Africa/Kampala', settings: { reminderEnabled: true } }
    expect(getLocalReminderWindow(now, organization.timezone).due).toBe(true)
    expect(shouldCreateReminder({ organization, submitted: true, existingReminder: false, now })).toBe(false)
    expect(shouldCreateReminder({ organization, submitted: false, existingReminder: false, now })).toBe(true)
    expect(shouldCreateReminder({ organization, submitted: false, existingReminder: true, now })).toBe(false)
  })
})
