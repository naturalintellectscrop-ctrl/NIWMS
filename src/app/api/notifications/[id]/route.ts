import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'

// Notification ids in the bell feed come from two stores: org-scoped
// reportingNotifications (employee-targeted or broadcast) and per-user
// notifications (admin digests, system notices). Resolve either, with
// ownership enforced in both branches.
type ResolvedNotification =
  | { response: NextResponse }
  | { response?: undefined; kind: 'employee'; notification: { id: string; employeeId: string | null } }
  | { response?: undefined; kind: 'user'; userNotification: { id: string } }

async function resolveNotification(request: NextRequest, id: string): Promise<ResolvedNotification> {
  const payload = await authenticateRequest(request)
  if (!payload) return { response: unauthorizedResponse() }
  const tenant = await getTenantContext(payload)
  if (!tenant) return { response: unauthorizedResponse('Active organization membership required') }
  const employee = await db.reportingEmployee.findFirst({ where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' } } })

  const notification = employee
    ? await db.reportingNotification.findFirst({ where: { id, organizationId: tenant.organizationId, OR: [{ employeeId: employee.id }, { employeeId: null }] } })
    : null
  if (notification) {
    // Only employee-targeted rows may be mutated; broadcasts are read-only.
    if (notification.employeeId !== employee?.id) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    return { kind: 'employee', notification }
  }

  const userNotification = await db.notification.findFirst({ where: { id, userId: payload.userId } })
  if (userNotification) return { kind: 'user', userNotification }

  return { response: NextResponse.json({ error: 'Notification not found' }, { status: 404 }) }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await resolveNotification(request, (await params).id)
    if (resolved.response) return resolved.response
    if (resolved.kind === 'user') {
      await db.notification.update({ where: { id: resolved.userNotification.id }, data: { read: true } })
      return NextResponse.json({ success: true })
    }
    await db.reportingNotification.update({ where: { id: resolved.notification.id }, data: { read: true } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Mark notification read error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolved = await resolveNotification(request, (await params).id)
    if (resolved.response) return resolved.response
    if (resolved.kind === 'user') {
      await db.notification.delete({ where: { id: resolved.userNotification.id } })
      return NextResponse.json({ success: true })
    }
    await db.reportingNotification.delete({ where: { id: resolved.notification.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
