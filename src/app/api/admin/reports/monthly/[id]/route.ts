import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin, forbiddenResponse } from '@/lib/auth'
import { getTenantContext } from '@/lib/tenant'
import { db } from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return forbiddenResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return forbiddenResponse('Active organization membership required')
    const { id } = await params
    const report = await db.reportingMonthlyReport.findFirst({ where: { id, organizationId: tenant.organizationId }, include: { employee: { include: { membership: true, position: true } }, comments: true } })
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    return NextResponse.json({ id: report.id, ...(report.reportData as Record<string, unknown>), status: report.status, generatedBy: report.generatedByUserId, createdAt: report.createdAt, approvedAt: report.approvedAt, comments: report.comments })
  } catch (error) {
    console.error('Admin get monthly report error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return forbiddenResponse()
    const tenant = await getTenantContext(payload)
    if (!tenant) return forbiddenResponse('Active organization membership required')
    const { id } = await params
    const report = await db.reportingMonthlyReport.findFirst({ where: { id, organizationId: tenant.organizationId }, select: { id: true, month: true, employeeId: true } })
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    await db.reportingMonthlyReport.delete({ where: { id } })
    await db.saaSAuditLog.create({ data: { organizationId: tenant.organizationId, actorUserId: payload.userId, action: 'monthly_report_deleted', resourceType: 'reporting_monthly_report', resourceId: id, metadata: { month: report.month, employeeId: report.employeeId } } })
    return NextResponse.json({ message: 'Report deleted successfully' })
  } catch (error) {
    console.error('Admin delete monthly report error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
