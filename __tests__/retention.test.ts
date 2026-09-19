import { describe, expect, it } from 'vitest'
import { getRetentionEnd, isEligibleForDeletion, RETENTION_DAYS } from '@/lib/retention'

describe('retention lifecycle', () => {
  const suspendedAt = new Date('2026-01-01T00:00:00.000Z')

  it('calculates the default 60-day retention window', () => {
    expect(getRetentionEnd(suspendedAt).toISOString()).toBe('2026-03-02T00:00:00.000Z')
    expect(RETENTION_DAYS).toBe(60)
  })

  it('requires pending deletion and an elapsed retention window', () => {
    const retentionEndsAt = getRetentionEnd(suspendedAt)
    expect(isEligibleForDeletion('suspended', retentionEndsAt, new Date('2026-03-03T00:00:00.000Z'))).toBe(false)
    expect(isEligibleForDeletion('pending_deletion', retentionEndsAt, new Date('2026-03-01T23:59:59.000Z'))).toBe(false)
    expect(isEligibleForDeletion('pending_deletion', retentionEndsAt, new Date('2026-03-02T00:00:00.000Z'))).toBe(true)
  })
})
