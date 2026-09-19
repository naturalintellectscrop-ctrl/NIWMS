import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, forbiddenResponse } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { db } from '@/lib/db'

const validTypes = ['info', 'reminder', 'warning', 'success', 'announcement']

export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return forbiddenResponse()
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response
    const body = await request.json()
    const { title, message, type, employeeIds, broadcast } = body
    if (typeof title !== 'string' || !title.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    if (typeof message !== 'string' || !message.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    const notifType = validTypes.includes(type) ? type : 'info'
    const employees = broadcast === true ? await db.reportingEmployee.findMany({ where: { organizationId: context.organizationId, status: 'active' }, select: { id: true } }) : await db.reportingEmployee.findMany({ where: { organizationId: context.organizationId, id: { in: Array.isArray(employeeIds) ? employeeIds : [] }, status: 'active' }, select: { id: true } })
    if (broadcast !== true && employees.length === 0) return NextResponse.json({ error: 'No valid employees found' }, { status: 400 })
    const targets = broadcast === true ? [null] : employees.map((employee) => employee.id)
    await db.reportingNotification.createMany({ data: targets.map((employeeId) => ({ organizationId: context.organizationId, employeeId, title: title.trim(), message: message.trim(), type: notifType })) })
    await db.saaSAuditLog.create({ data: { organizationId: context.organizationId, actorUserId: payload.userId, action: broadcast === true ? 'notification_broadcast' : 'notification_sent', resourceType: 'reporting_notification', metadata: { recipientCount: broadcast === true ? employees.length : targets.length, type: notifType } } })
    return NextResponse.json({ success: true, sentCount: broadcast === true ? employees.length : targets.length, sentTo: broadcast === true ? 'all_employees' : 'selected_employees' }, { status: 201 })
  } catch (error) {
    console.error('Admin send notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return forbiddenResponse()
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response
    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50))
    const offset = Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0)
    const where = { organizationId: context.organizationId }
    const [notifications, total] = await Promise.all([db.reportingNotification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset, include: { employee: { include: { membership: true, position: true } } } }), db.reportingNotification.count({ where })])
    return NextResponse.json({ notifications, total })
  } catch (error) {
    console.error('Admin list notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
