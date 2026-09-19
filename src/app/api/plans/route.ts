import { NextResponse } from 'next/server'
import { ensureDefaultPlans, DEFAULT_PLANS } from '@/lib/entitlements'
import { db } from '@/lib/db'
import { BILLING_INTERVAL_ORDER, planIntervalQuotes } from '@/lib/billing/pricing'

// GET /api/plans — public plan catalog with definitive per-interval pricing.
// Every money figure is computed by the shared billing engine from the stored
// monthly list price, so marketing, trials, and invoices never drift apart.
export async function GET() {
  await ensureDefaultPlans()
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { monthlyPrice: 'asc' } })
  return NextResponse.json({
    plans: plans.map((plan) => {
      const customPricing = plan.monthlyPrice === 0
      const intervals = planIntervalQuotes({ code: plan.key, name: plan.name, monthlyPrice: plan.monthlyPrice, maxEmployees: plan.maxEmployees, customPricing })
      return {
        key: plan.key,
        name: plan.name,
        description: DEFAULT_PLANS.find((fixture) => fixture.key === plan.key)?.description ?? '',
        monthlyPrice: plan.monthlyPrice,
        maxEmployees: plan.maxEmployees,
        entitlements: JSON.parse(plan.entitlements),
        customPricing,
        intervals,
        intervalOrder: BILLING_INTERVAL_ORDER,
      }
    }),
  })
}
