import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'

async function resolveReport(request: NextRequest, id: string) {
  const payload = await authenticateRequest(request)
  if (!payload) return { response: unauthorizedResponse() }
  const tenant = await getTenantContext(payload)
  if (!tenant) return { response: NextResponse.json({ error: 'Active organization membership required' }, { status: 403 }) }
  const employee = await db.reportingEmployee.findFirst({ where: { organizationId: tenant.organizationId, membership: { userId: payload.userId, status: 'active' }, status: 'active' } })
  if (!employee) return { response: NextResponse.json({ error: 'Report not found' }, { status: 404 }) }
  const report = await db.reportingDailyReport.findFirst({ where: { id, organizationId: tenant.organizationId, employeeId: employee.id } })
  if (!report) return { response: NextResponse.json({ error: 'Report not found' }, { status: 404 }) }
  return { payload, tenant, report }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const resolved = await resolveReport(request, id)
    if ('response' in resolved) return resolved.response
    const body = await request.json()
    const { activityText, location, timeIn, timeOut, comments } = body
    if (typeof activityText !== 'string' || !activityText.trim()) return NextResponse.json({ error: 'Activity text is required' }, { status: 400 })
    if (timeIn && !/^\d{2}:\d{2}$/.test(timeIn)) return NextResponse.json({ error: 'Invalid time-in format. Use HH:MM (e.g. 08:00)' }, { status: 400 })
    if (timeOut && !/^\d{2}:\d{2}$/.test(timeOut)) return NextResponse.json({ error: 'Invalid time-out format. Use HH:MM (e.g. 17:00)' }, { status: 400 })
    const updated = await db.reportingDailyReport.update({ where: { id: resolved.report.id }, data: { activityText: activityText.trim(), location: location?.trim() || null, timeIn: timeIn?.trim() || null, timeOut: timeOut?.trim() || null, comments: comments?.trim() || null } })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update report error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const resolved = await resolveReport(request, id)
    if ('response' in resolved) return resolved.response
    await db.reportingDailyReport.delete({ where: { id: resolved.report.id } })
    return NextResponse.json({ message: 'Report deleted' })
  } catch (error) {
    console.error('Delete report error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
