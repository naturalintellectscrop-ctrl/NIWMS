import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncOrganizationLifecycle } from '@/lib/lifecycle'

export async function POST(request: Request) {
  const expected = process.env.BILLING_CRON_SECRET ?? process.env.JWT_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const organizations = await db.saaSOrganization.findMany({ select: { id: true } })
  let processed = 0
  let paused = 0
  let purged = 0
  for (const organization of organizations) {
    const result = await syncOrganizationLifecycle(organization.id)
    processed += 1
    if (result.action === 'grace_started' || result.action === 'subscription_expired') paused += 1
    if (result.action === 'organization_purged') purged += 1
  }
  return NextResponse.json({ processed, paused, purged })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
