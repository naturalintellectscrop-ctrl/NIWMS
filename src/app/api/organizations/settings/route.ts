import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { db } from '@/lib/db'

const VALID_TIMEZONES = new Set<string>(
  typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
    ? (Intl as unknown as { supportedValuesOf(type: 'timeZone'): string[] }).supportedValuesOf('timeZone')
    : ['Africa/Kampala', 'Africa/Nairobi', 'Africa/Lagos', 'Europe/London', 'UTC']
)

function validDeadline(value: unknown): value is string {
  return typeof value === 'string' && /^([01]?\d|2[0-3]):([0-5]\d)$/.test(value.trim())
}

// GET /api/organizations/settings - reporting preferences for the tenant
export async function GET(request: NextRequest) {
  const payload = await authenticateRequest(request)
  const { context, response } = await requireOrganizationAdmin(payload)
  if (!context) return response
  const organization = await db.saaSOrganization.findUnique({
    where: { id: context.organizationId },
    select: { name: true, slug: true, timezone: true, reportDeadline: true, reminderEnabled: true },
  })
  if (!organization) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  return NextResponse.json(organization)
}

// PATCH /api/organizations/settings - update reporting preferences
export async function PATCH(request: NextRequest) {
  const payload = await authenticateRequest(request)
  const { context, response } = await requireOrganizationAdmin(payload)
  if (!context) return response
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const updates: { timezone?: string; reportDeadline?: string; reminderEnabled?: boolean } = {}
    if (body.timezone !== undefined) {
      const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : ''
      if (!timezone || !VALID_TIMEZONES.has(timezone)) {
        return NextResponse.json({ error: 'Unsupported timezone' }, { status: 400 })
      }
      updates.timezone = timezone
    }
    if (body.reportDeadline !== undefined) {
      if (!validDeadline(body.reportDeadline)) {
        return NextResponse.json({ error: 'Report deadline must be a time in HH:MM format' }, { status: 400 })
      }
      const [hours, minutes] = body.reportDeadline.trim().split(':')
      updates.reportDeadline = `${hours.padStart(2, '0')}:${minutes}`
    }
    if (body.reminderEnabled !== undefined) {
      if (typeof body.reminderEnabled !== 'boolean') {
        return NextResponse.json({ error: 'reminderEnabled must be a boolean' }, { status: 400 })
      }
      updates.reminderEnabled = body.reminderEnabled
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No settings provided' }, { status: 400 })
    }

    const organization = await db.saaSOrganization.update({
      where: { id: context.organizationId },
      data: updates,
      select: { name: true, slug: true, timezone: true, reportDeadline: true, reminderEnabled: true },
    })

    await db.saaSAuditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: payload?.userId,
        action: 'organization_settings_updated',
        resourceType: 'organization',
        resourceId: context.organizationId,
        metadata: JSON.parse(JSON.stringify(updates)),
      },
    })

    return NextResponse.json(organization)
  } catch (error) {
    console.error('Update organization settings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
