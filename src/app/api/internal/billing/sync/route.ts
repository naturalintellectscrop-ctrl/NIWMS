import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncOrganizationLifecycle } from '@/lib/lifecycle'

export async function POST(request: Request) {
  const expected = process.env.BILLING_CRON_SECRET ?? process.env.JWT_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const organizations = await db.organization.findMany({ select: { id: true } })
  let processed = 0
  for (const organization of organizations) {
    await syncOrganizationLifecycle(organization.id)
    processed += 1
  }
  return NextResponse.json({ processed })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
