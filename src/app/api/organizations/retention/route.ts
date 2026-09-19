import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/auth'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { confirmOrganizationDeletion, requestOrganizationDeletion } from '@/lib/retention'

export async function POST(request: NextRequest) {
  const payload = await authenticateRequest(request)
  if (!payload) return unauthorizedResponse()
  let body: { action?: 'request' | 'confirm'; organizationId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }) }
  if (!body.action || !body.organizationId) return NextResponse.json({ error: 'Action and organizationId are required' }, { status: 400 })

  if (body.action === 'confirm') {
    if (payload.role !== 'super_admin') return forbiddenResponse('Platform administrator confirmation required')
    try { return NextResponse.json({ organization: await confirmOrganizationDeletion(body.organizationId, payload.userId) }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Deletion confirmation failed' }, { status: 409 }) }
  }

  const { context, response } = await requireOrganizationAdmin(payload)
  if (!context) return response
  if (context.organizationId !== body.organizationId) return forbiddenResponse('Organization access denied')
  try { return NextResponse.json({ organization: await requestOrganizationDeletion(context.organizationId, context.userId) }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Deletion request failed' }, { status: 409 }) }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
