// =============================================================================
// NIWMS billing math — the single source of truth for plan pricing.
//
// Every price shown anywhere (marketing calculator, trial request, workspace
// billing, invoices) must come from these functions so the numbers are
// definitive: the money charged, the period covered, and the renewal date are
// computed once, server-side, from one set of rules.
//
// Money convention: whole UGX integers (UGX has no practical minor unit in
// circulation). VAT is applied at billing time and never rounded per-line.
// =============================================================================

export type BillingInterval = 'monthly' | 'quarterly' | 'annual'

export interface BillingIntervalRule {
  key: BillingInterval
  label: string
  /** Calendar months covered by one billing period. */
  months: number
  /** Fraction of the monthly price charged per month when billed on this interval. */
  monthlyRateFactor: number
}

export const BILLING_INTERVALS: Record<BillingInterval, BillingIntervalRule> = {
  monthly: { key: 'monthly', label: 'Monthly', months: 1, monthlyRateFactor: 1 },
  quarterly: { key: 'quarterly', label: 'Quarterly', months: 3, monthlyRateFactor: 0.95 },
  annual: { key: 'annual', label: 'Annual', months: 12, monthlyRateFactor: 0.9 },
}

export const BILLING_INTERVAL_ORDER: BillingInterval[] = ['monthly', 'quarterly', 'annual']

/** Uganda standard VAT rate, overridable per deployment via BILLING_VAT_RATE. */
export const DEFAULT_VAT_RATE = 0.18

export function getVatRate(): number {
  const raw = Number.parseFloat(process.env.BILLING_VAT_RATE ?? '')
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return DEFAULT_VAT_RATE
  return raw + 0 // normalize any -0 into +0
}

export interface QuoteInput {
  /** Definitive monthly list price for the plan, whole UGX. */
  monthlyPrice: number
  interval: BillingInterval
  /** Billing start (defaults to now). Renewal = start + months, calendar-accurate. */
  startsAt?: Date
  vatRate?: number
}

export interface Quote {
  interval: BillingInterval
  intervalLabel: string
  /** Calendar months one paid period covers. */
  monthsCovered: number
  /** List monthly price before any interval discount. */
  listMonthlyPrice: number
  /** Effective per-month price after the interval discount (rounded to whole UGX). */
  effectiveMonthlyPrice: number
  /** Amount charged for one period, excluding VAT. */
  subtotal: number
  vatRate: number
  vatAmount: number
  /** Amount charged for one period, VAT inclusive. This is the definitive charge. */
  total: number
  /** What the same period would cost billed monthly, VAT inclusive. */
  monthlyEquivalentTotal: number
  savings: number
  savingsPercent: number
  periodStart: string
  periodEnd: string
  /** The next charge date — equal to periodEnd by definition. */
  renewsAt: string
  periodStartLabel: string
  periodEndLabel: string
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDay(date: Date): string {
  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
}

/**
 * Adds calendar months while clamping the day-of-month (Jan 31 + 1 month → Feb 28),
 * so renewal dates are always valid and unambiguous.
 */
export function addCalendarMonths(start: Date, months: number): Date {
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth()
  const day = start.getUTCDate()
  const targetFirst = Date.UTC(year, month + months, 1)
  const target = new Date(targetFirst)
  const daysInTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, daysInTargetMonth)
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), clampedDay, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds()))
}

/** Rounds half away from zero on whole-UGX granularity; money is always a non-negative-zero integer. */
function roundMoney(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) - Number.EPSILON)
  return rounded === 0 ? 0 : rounded
}

export function computeQuote(input: QuoteInput): Quote {
  const rule = BILLING_INTERVALS[input.interval]
  const vatRate = input.vatRate ?? getVatRate()
  const start = input.startsAt ?? new Date()
  const end = addCalendarMonths(start, rule.months)

  const listMonthlyPrice = Math.max(0, Math.round(input.monthlyPrice))
  const effectiveMonthlyPrice = roundMoney(listMonthlyPrice * rule.monthlyRateFactor)
  const subtotal = effectiveMonthlyPrice * rule.months
  const vatAmount = roundMoney(subtotal * vatRate)
  const total = subtotal + vatAmount

  const monthlyEquivalentSubtotal = listMonthlyPrice * rule.months
  const monthlyEquivalentTotal = monthlyEquivalentSubtotal + roundMoney(monthlyEquivalentSubtotal * vatRate)
  const savings = Math.max(0, monthlyEquivalentTotal - total)
  const savingsPercent = monthlyEquivalentTotal > 0 ? Math.round((savings / monthlyEquivalentTotal) * 100) : 0

  return {
    interval: rule.key,
    intervalLabel: rule.label,
    monthsCovered: rule.months,
    listMonthlyPrice,
    effectiveMonthlyPrice,
    subtotal,
    vatRate,
    vatAmount,
    total,
    monthlyEquivalentTotal,
    savings,
    savingsPercent,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    renewsAt: end.toISOString(),
    periodStartLabel: formatDay(start),
    periodEndLabel: formatDay(end),
  }
}

/** Formatted UGX amount, e.g. 67500 → "UGX 67,500". */
export function formatUgx(amount: number): string {
  return `UGX ${Math.round(amount).toLocaleString('en-US')}`
}

export interface PlanPricing {
  code: string
  name: string
  monthlyPrice: number
  maxEmployees: number | null
  customPricing?: boolean
}

/** Per-interval quotes for a plan — used by catalogs, calculators, and invoices. */
export function planIntervalQuotes(plan: PlanPricing, startsAt?: Date): Record<BillingInterval, Quote> {
  const result = {} as Record<BillingInterval, Quote>
  for (const interval of BILLING_INTERVAL_ORDER) {
    result[interval] = computeQuote({ monthlyPrice: plan.monthlyPrice, interval, startsAt })
  }
  return result
}
