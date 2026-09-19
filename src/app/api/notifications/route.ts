import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'

// The bell merges two stores:
//  - reportingNotification: org-scoped rows targeting a reporting employee
//    (reminders, broadcasts) — `read` is tracked per row.
//  - notification: per-user rows (admin digests, system notices) — also
//    carries `read`. Merged newest-first into one feed.
function normalizeUserNotification(row: { id: string; title: string; message: string; type: string; read: boolean; createdAt: Date }) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    scope: 'user' as const,
  }
}

function normalizeReportingNotification(row: { id: string; title: string; message: string; type: string; read: boolean; createdAt: Date }) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    scope: 'employee' as const,
  }
}

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return unauthorizedResponse('Active organization membership required')
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread') === 'true'
    const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get('limit') || '30', 10) || 30))
    const employee = await db.reportingEmployee.findFirst({ where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' } } })

    const reportingRows = await db.reportingNotification.findMany({
      where: { organizationId: tenant.organizationId, ...(employee ? { OR: [{ employeeId: employee.id }, { employeeId: null }] } : { employeeId: null }), ...(unreadOnly ? { read: false, employeeId: employee?.id } : {}) },
      orderBy: { createdAt: 'desc' }, take: limit,
    })
    const userRows = await db.notification.findMany({
      where: { userId: payload.userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' }, take: limit,
    })

    const notifications = [
      ...reportingRows.map(normalizeReportingNotification),
      ...userRows.map(normalizeUserNotification),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)

    const reportingUnread = employee
      ? await db.reportingNotification.count({ where: { organizationId: tenant.organizationId, employeeId: employee.id, read: false } })
      : 0
    const userUnread = await db.notification.count({ where: { userId: payload.userId, read: false } })
    return NextResponse.json({ notifications, unreadCount: reportingUnread + userUnread })
  } catch (error) {
    console.error('List notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return unauthorizedResponse('Active organization membership required')
    const employee = await db.reportingEmployee.findFirst({ where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' } } })
    const { action } = await request.json()
    if (action !== 'mark-all-read') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    if (employee) {
      await db.reportingNotification.updateMany({ where: { organizationId: tenant.organizationId, employeeId: employee.id, read: false }, data: { read: true } })
    }
    await db.notification.updateMany({ where: { userId: payload.userId, read: false }, data: { read: true } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
