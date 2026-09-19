export type TenantMembership = {
  organizationId: string
  role: string
  status?: string
}

export const ACTIVE_ORGANIZATION_STATES = ['active', 'trial', 'grace'] as const

export function selectTenantMembership<T extends TenantMembership>(
  memberships: T[],
  requestedOrganizationId?: string,
): T | null {
  const active = memberships.filter((membership) => !membership.status || membership.status === 'active')
  if (requestedOrganizationId) {
    return active.find((membership) => membership.organizationId === requestedOrganizationId) ?? null
  }
  return active.length === 1 ? active[0] : null
}

export function canAccessTenantResource(contextOrganizationId: string, resourceOrganizationId: string) {
  return contextOrganizationId === resourceOrganizationId
}

export function canAccessLifecycleState(status: string) {
  return (ACTIVE_ORGANIZATION_STATES as readonly string[]).includes(status)
}

export function canAccessOrganizationAdmin(role: string, organizationRole: string) {
  return role === 'admin' || organizationRole === 'owner' || organizationRole === 'admin'
}
