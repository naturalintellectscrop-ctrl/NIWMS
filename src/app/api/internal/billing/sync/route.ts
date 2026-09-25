import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { syncOrganizationLifecycle } from '@/lib/lifecycle'
import { reconcilePendingPayments, createDueRenewals } from '@/lib/payments/service'
import { cronAuthorized, cronUnauthorizedResponse } from '@/lib/cron-auth'

// Cron sweep (Vercel cron, every 15 minutes — invoked with GET, see vercel.json):
//   1. Lifecycle engine — subscription/trial expiry → grace → purge (unchanged).
//   2. Payment reconciliation — payments stuck open >5 min are re-checked
//      against Nylon Pay, so a payment never stays inconsistent merely because
//      the customer's browser never came back.
//   3. Renewal collections — active subscriptions whose paid period ends within
//      3 days get one NIWMS-driven renewal invoice (Nylon Pay has no
//      subscription-plans API; per-period hosted invoices are the supported
//      recurring mechanism).
// Task 23 audit fix: exports GET (Vercel cron's method) AND POST; bearer
// comparison is constant-time and also accepts CRON_SECRET.
async function sweep(request: Request) {
  if (!cronAuthorized(request)) {
    return cronUnauthorizedResponse()
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

  let reconciled = { checked: 0, resolved: 0, errors: 0 }
  let renewals = { created: 0, skipped: 0 }
  const nylonConfigured = Boolean(process.env.NYLONPAY_API_KEY && process.env.NYLONPAY_API_SECRET)
  if (nylonConfigured) {
    try {
      reconciled = await reconcilePendingPayments()
    } catch { reconciled = { checked: 0, resolved: 0, errors: 1 } }
    try {
      renewals = await createDueRenewals()
    } catch { renewals = { created: 0, skipped: 0 } }
  }

  return NextResponse.json({ processed, paused, purged, payments: reconciled, renewals })
}

export async function GET(request: Request) {
  return sweep(request)
}

export async function POST(request: Request) {
  return sweep(request)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
