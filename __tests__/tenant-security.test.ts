import { describe, expect, it } from 'vitest'
import { sessionCookie, verifyToken } from '@/lib/auth'
import {
  canAccessLifecycleState,
  canAccessOrganizationAdmin,
  canAccessTenantResource,
  selectTenantMembership,
} from '@/lib/authorization'

describe('tenant security regression suite', () => {
  it('requires explicit organization selection for multi-organization users', () => {
    const memberships = [
      { organizationId: 'org-a', role: 'admin', status: 'active' },
      { organizationId: 'org-b', role: 'member', status: 'active' },
    ]

    expect(selectTenantMembership(memberships)).toBeNull()
    expect(selectTenantMembership(memberships, 'org-a')?.organizationId).toBe('org-a')
    expect(selectTenantMembership(memberships, 'org-b')?.organizationId).toBe('org-b')
    expect(selectTenantMembership(memberships, 'org-c')).toBeNull()
  })

  it('rejects inactive memberships and cross-tenant resource IDs', () => {
    expect(selectTenantMembership([{ organizationId: 'org-a', role: 'admin', status: 'suspended' }])).toBeNull()
    expect(canAccessTenantResource('org-a', 'org-a')).toBe(true)
    expect(canAccessTenantResource('org-a', 'org-b')).toBe(false)
  })

  it('does not allow client-controlled organization IDs to change context', () => {
    const contextOrganizationId = 'org-a'
    const requestedOrganizationId = 'org-b'
    expect(canAccessTenantResource(contextOrganizationId, requestedOrganizationId)).toBe(false)
  })

  it('allows only active lifecycle states for customer APIs', () => {
    expect(canAccessLifecycleState('active')).toBe(true)
    expect(canAccessLifecycleState('trial')).toBe(true)
    expect(canAccessLifecycleState('grace')).toBe(true)
    expect(canAccessLifecycleState('suspended')).toBe(false)
    expect(canAccessLifecycleState('archived')).toBe(false)
    expect(canAccessLifecycleState('pending_deletion')).toBe(false)
  })

  it('keeps organization admin and employee boundaries separate', () => {
    expect(canAccessOrganizationAdmin('admin', 'member')).toBe(true)
    expect(canAccessOrganizationAdmin('employee', 'admin')).toBe(true)
    expect(canAccessOrganizationAdmin('employee', 'member')).toBe(false)
  })

  it('uses an HttpOnly session cookie and rejects malformed tokens', async () => {
    const cookie = sessionCookie('synthetic-test-token')
    expect(cookie.name).toBe('ni_session')
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('lax')
    expect(cookie.path).toBe('/')
    expect(await verifyToken('not-a-valid-token')).toBeNull()
  })
})
