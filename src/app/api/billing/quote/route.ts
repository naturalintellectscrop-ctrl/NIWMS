import { NextRequest, NextResponse } from 'next/server'
import { ensureDefaultPlans } from '@/lib/entitlements'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limiter'
import { computeQuote, type BillingInterval } from '@/lib/billing/pricing'

const INTERVALS: BillingInterval[] = ['monthly', 'quarterly', 'annual']

// GET /api/billing/quote?plan=business&interval=annual&seats=24
//
// Public pre-signup quote endpoint backing the marketing pricing calculator.
// Returns the definitive numbers for a prospective subscription: the exact
// amount that would be charged (VAT inclusive), the calendar period covered,
// and the renewal date. Rate-limited because it is anonymous.
export async function GET(request: NextRequest) {
  // Per-IP bucket (Task 23 audit fix): was a single global key, letting one
  // client exhaust the quote calculator for everyone.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = checkRateLimit(ip, 'billing_quote')
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many quote requests. Please try again shortly.' }, { status: 429 })
  }

  const url = new URL(request.url)
  const planKey = (url.searchParams.get('plan') ?? '').trim().toLowerCase()
  const intervalParam = (url.searchParams.get('interval') ?? 'monthly').trim().toLowerCase()
  const seatsParam = Number.parseInt(url.searchParams.get('seats') ?? '', 10)

  await ensureDefaultPlans()
  const plans = await db.plan.findMany({ where: { active: true } })
  if (plans.length === 0) {
    return NextResponse.json({ error: 'Plan catalog is not configured' }, { status: 503 })
  }

  const plan = plans.find((row) => row.key === planKey) ?? null
  if (!plan) {
    return NextResponse.json({ error: 'Unknown plan', plans: plans.map((row) => row.key) }, { status: 404 })
  }

  const interval = INTERVALS.includes(intervalParam as BillingInterval) ? (intervalParam as BillingInterval) : 'monthly'
  const seats = Number.isFinite(seatsParam) && seatsParam > 0 ? Math.min(seatsParam, 100000) : null
  const fits = seats === null || plan.maxEmployees === null || seats <= plan.maxEmployees

  const quote = computeQuote({ monthlyPrice: plan.monthlyPrice, interval })

  return NextResponse.json({
    plan: {
      key: plan.key,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      maxEmployees: plan.maxEmployees,
      customPricing: plan.monthlyPrice === 0,
    },
    interval,
    seats,
    fits,
    quote,
  })
}
