import { NextResponse } from 'next/server'

// RETIRED (Task 23 production-readiness audit): this was the pre-Nylon generic
// billing webhook. It trusted payload organization ids and persisted raw
// unvalidated status strings into subscriptions — dead code (zero in-repo
// callers) that remained reachable attack surface. The sole supported payment
// webhook is /api/billing/webhook/nylonpay (HMAC-signed, DB-idempotent).
export async function POST() {
  return NextResponse.json(
    { error: 'This webhook endpoint has been retired. Use /api/billing/webhook/nylonpay.' },
    { status: 410 }
  )
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
