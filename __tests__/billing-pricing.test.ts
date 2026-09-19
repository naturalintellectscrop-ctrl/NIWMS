import { afterEach, describe, expect, it } from 'vitest'
import {
  addCalendarMonths,
  BILLING_INTERVAL_ORDER,
  computeQuote,
  formatUgx,
  getVatRate,
  planIntervalQuotes,
  type Quote,
} from '@/lib/billing/pricing'

const STARTER_MONTHLY = 30000

describe('billing pricing engine', () => {
  afterEach(() => {
    delete process.env.BILLING_VAT_RATE
  })

  it('charges exactly the list price monthly with VAT on top', () => {
    const quote = computeQuote({ monthlyPrice: STARTER_MONTHLY, interval: 'monthly', startsAt: new Date('2026-03-15T09:00:00Z') })
    expect(quote.monthsCovered).toBe(1)
    expect(quote.effectiveMonthlyPrice).toBe(30000)
    expect(quote.subtotal).toBe(30000)
    expect(quote.vatRate).toBe(0.18)
    expect(quote.vatAmount).toBe(5400)
    expect(quote.total).toBe(35400)
    expect(quote.savings).toBe(0)
    expect(quote.periodEndLabel).toBe('Apr 15, 2026')
  })

  it('applies the quarterly factor and 5% savings deterministically', () => {
    const quote = computeQuote({ monthlyPrice: STARTER_MONTHLY, interval: 'quarterly', startsAt: new Date('2026-03-15T09:00:00Z') })
    expect(quote.monthsCovered).toBe(3)
    expect(quote.effectiveMonthlyPrice).toBe(28500)
    expect(quote.subtotal).toBe(85500)
    expect(quote.vatAmount).toBe(15390)
    expect(quote.total).toBe(100890)
    // Monthly equivalent: 3 × 30000 + VAT(16200... 30000*3*0.18=16200) = 106200
    expect(quote.monthlyEquivalentTotal).toBe(106200)
    expect(quote.savings).toBe(5310)
    expect(quote.savingsPercent).toBe(5)
    expect(quote.periodEndLabel).toBe('Jun 15, 2026')
  })

  it('applies the annual factor: 10.8× list price, VAT inclusive', () => {
    const quote = computeQuote({ monthlyPrice: STARTER_MONTHLY, interval: 'annual', startsAt: new Date('2026-03-15T09:00:00Z') })
    expect(quote.monthsCovered).toBe(12)
    expect(quote.effectiveMonthlyPrice).toBe(27000)
    expect(quote.subtotal).toBe(324000)
    expect(quote.vatAmount).toBe(58320)
    expect(quote.total).toBe(382320)
    expect(quote.monthlyEquivalentTotal).toBe(424800)
    expect(quote.savings).toBe(42480)
    expect(quote.savingsPercent).toBe(10)
    expect(quote.periodEndLabel).toBe('Mar 15, 2027')
  })

  it('uses the same annual math across plan tiers (75k business)', () => {
    const quote = computeQuote({ monthlyPrice: 75000, interval: 'annual', startsAt: new Date('2026-06-01T00:00:00Z') })
    expect(quote.subtotal).toBe(810000) // 67500 × 12
    expect(quote.total).toBe(955800)
    expect(quote.periodEndLabel).toBe('Jun 1, 2027')
  })

  it('clamps calendar-month ends so renewals always land on a valid date', () => {
    expect(addCalendarMonths(new Date('2026-01-31T12:00:00Z'), 1).toISOString()).toBe('2026-02-28T12:00:00.000Z')
    // 2028 is a leap year — Feb 29 is honored.
    expect(addCalendarMonths(new Date('2027-11-30T12:00:00Z'), 3).toISOString()).toBe('2028-02-29T12:00:00.000Z')
    expect(addCalendarMonths(new Date('2026-05-31T12:00:00Z'), 12).toISOString()).toBe('2027-05-31T12:00:00.000Z')
  })

  it('keeps period dates and renewal identical and ISO-formatted', () => {
    const quote = computeQuote({ monthlyPrice: STARTER_MONTHLY, interval: 'quarterly', startsAt: new Date('2026-02-20T10:30:00Z') })
    expect(quote.periodStart).toBe('2026-02-20T10:30:00.000Z')
    expect(quote.periodEnd).toBe('2026-05-20T10:30:00.000Z')
    expect(quote.renewsAt).toBe(quote.periodEnd)
    expect(() => new Date(quote.renewsAt).toISOString()).not.toThrow()
  })

  it('supports deployment-specific VAT via BILLING_VAT_RATE', () => {
    process.env.BILLING_VAT_RATE = '0'
    expect(getVatRate()).toBe(0)
    const noVat = computeQuote({ monthlyPrice: 150000, interval: 'monthly' })
    expect(noVat.vatAmount).toBe(0)
    expect(noVat.total).toBe(150000)

    process.env.BILLING_VAT_RATE = '0.24'
    expect(computeQuote({ monthlyPrice: 100000, interval: 'monthly' }).vatAmount).toBe(24000)

    // Invalid values fall back to the Uganda default rather than breaking billing.
    process.env.BILLING_VAT_RATE = 'not-a-number'
    expect(getVatRate()).toBe(0.18)
    process.env.BILLING_VAT_RATE = '3'
    expect(getVatRate()).toBe(0.18)
  })

  it('renders enterprise custom pricing as zero-cost quotes without dividing by zero', () => {
    for (const interval of BILLING_INTERVAL_ORDER) {
      const quote = computeQuote({ monthlyPrice: 0, interval })
      expect(quote.total).toBe(0)
      expect(quote.savings).toBe(0)
      expect(quote.savingsPercent).toBe(0)
    }
  })

  it('planIntervalQuotes covers every interval with consistent anchors', () => {
    const quotes = planIntervalQuotes({ code: 'business', name: 'Business', monthlyPrice: 75000, maxEmployees: 30 })
    const keys = Object.keys(quotes) as Array<keyof typeof quotes>
    expect(keys.sort()).toEqual(['annual', 'monthly', 'quarterly'])
    const annual: Quote = quotes.annual
    expect(annual.total).toBeLessThan(quotes.monthly.total * 12)
    expect(quotes.quarterly.total).toBeLessThan(quotes.monthly.total * 3)
  })

  it('formats UGX currency with grouping', () => {
    expect(formatUgx(100890)).toBe('UGX 100,890')
    expect(formatUgx(382320.4)).toBe('UGX 382,320')
  })
})
