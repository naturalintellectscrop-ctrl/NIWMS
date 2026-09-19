import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { requireTenant } from '@/lib/tenant'
import { syncOrganizationLifecycle } from '@/lib/lifecycle'

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  const { context, response } = await requireTenant(auth)
  if (!context) return response
  const organization = await syncOrganizationLifecycle(context.organizationId)
  return NextResponse.json({ organization })
}
