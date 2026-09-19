'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarRange, Check, CreditCard, Loader2, LockKeyhole, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { computeQuote, type BillingInterval, type Quote } from '@/lib/billing/pricing'

type BillingData = {
  organization: { status: string; trialEndsAt: string | null; graceEndsAt: string | null } | null
  usage: { employeeCount: number; employeeLimit: number | null; canAddEmployee: boolean }
  subscription: {
    status: string
    provider: string | null
    billingInterval: BillingInterval
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    plan: { name: string; key: string; monthlyPrice: number; maxEmployees: number | null }
    quote: Quote | null
  } | null
}

const formatUgx = (value: number) => `UGX ${value.toLocaleString()}`

const INTERVAL_OPTIONS: Array<{ key: BillingInterval; label: string; note: string }> = [
  { key: 'monthly', label: 'Monthly', note: 'Billed every month' },
  { key: 'quarterly', label: 'Quarterly', note: 'Billed every 3 months · 5% off' },
  { key: 'annual', label: 'Annual', note: 'Billed yearly · 10% off' },
]

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info')
  const [loading, setLoading] = useState(true)
  const [savingInterval, setSavingInterval] = useState<BillingInterval | null>(null)

  async function changeInterval(interval: BillingInterval) {
    if (!data?.subscription || savingInterval) return
    setSavingInterval(interval)
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_interval', interval }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(result.error ?? 'Unable to change the billing interval right now.')
        setMessageTone('error')
        return
      }
      setMessage(`Billing interval set to ${interval}. ${data.subscription.status === 'active' ? 'Your new period starts today.' : 'It will govern your first charge when the trial converts.'}`)
      setMessageTone('info')
      setData((current) => current && current.subscription ? { ...current, subscription: { ...current.subscription, billingInterval: interval, quote: result.quote ?? current.subscription.quote } } : current)
    } finally {
      setSavingInterval(null)
    }
  }

  useEffect(() => {
    fetch('/api/billing', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load billing details')
        return response.json() as Promise<BillingData>
      })
      .then(setData)
      .catch((error: Error) => { setMessage(error.message); setMessageTone('error') })
      .finally(() => setLoading(false))
  }, [])

  async function requestCancellation() {
    const response = await fetch('/api/billing', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) })
    const result = await response.json()
    setMessage(result.error ?? 'Cancellation scheduled for the end of the current billing period')
    setMessageTone(result.error ? 'error' : 'info')
    if (response.ok) setData((current) => current ? { ...current, subscription: current.subscription ? { ...current.subscription, cancelAtPeriodEnd: true } : null } : current)
  }

  async function requestCheckout() {
    if (!data?.subscription) return
    const response = await fetch('/api/billing', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey: data.subscription.plan.key }),
    })
    const result = await response.json()
    setMessage(result.error ?? 'Checkout request completed')
    setMessageTone(result.error ? 'error' : 'info')
  }

  const capacityPercent = data?.usage.employeeLimit ? Math.min(100, Math.round((data.usage.employeeCount / data.usage.employeeLimit) * 100)) : 0

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-5 py-10 text-[#17212b] lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-[#526158] transition hover:text-[#123c36]">
          <ArrowLeft className="h-4 w-4" /> Back to workspace
        </Link>
        <div className="mb-10 mt-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]"><span className="h-px w-8 bg-[#c47b32]" /> Billing & subscription</p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[#123c36]">Plan and capacity</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#64716f]">Manage your organization plan, lifecycle status, and employee capacity from one secure place.</p>
          </div>
          <span className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-[#123c36] text-[#f4f6f8] sm:flex"><CreditCard className="h-5 w-5" aria-hidden="true" /></span>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 text-[#64716f]"><RefreshCw className="h-4 w-4 animate-spin" /> Loading subscription…</div>
        ) : data?.subscription ? (
          <section className="product-card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#829086]">Current plan</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#123c36]">{data.subscription.plan.name}</h2>
                <p className="mt-2 text-sm capitalize text-[#64716f]">{data.subscription.status} · {data.subscription.plan.maxEmployees ?? 'Unlimited'} employees</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold text-[#123c36]">{data.subscription.plan.monthlyPrice === 0 ? 'Custom' : data.subscription.quote ? formatUgx(data.subscription.quote.effectiveMonthlyPrice) : formatUgx(data.subscription.plan.monthlyPrice)}<span className="text-sm font-normal text-[#829086]"> / month</span></p>
                <p className="mt-1 text-xs capitalize text-[#738078]">Billed {data.subscription.billingInterval}{data.subscription.quote && data.subscription.plan.monthlyPrice > 0 ? ` · ${formatUgx(data.subscription.quote.total)} incl. VAT` : ''}</p>
                {data.subscription.currentPeriodEnd && <p className="mt-2 text-xs text-[#738078]">Renews {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()}</p>}
                {data.subscription.status === 'trialing' && data.organization?.trialEndsAt && <p className="mt-1 text-xs text-[#b2761b]">Trial ends {new Date(data.organization.trialEndsAt).toLocaleDateString()}</p>}
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[#dce4e1] pt-6">
              <button onClick={requestCheckout} disabled={data.subscription.cancelAtPeriodEnd} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#123c36] px-6 text-sm font-semibold text-[#f4f6f8] transition hover:bg-[#1d5249] disabled:cursor-not-allowed disabled:opacity-50"> <CreditCard className="h-4 w-4" /> Manage plan</button>
              {data.subscription.status === 'active' && !data.subscription.cancelAtPeriodEnd && <button onClick={requestCancellation} className="inline-flex min-h-11 items-center rounded-full border border-[#d2ddda] px-5 text-sm font-medium text-[#356247] transition hover:bg-[#e9f0ee]">Cancel at period end</button>}
              <span className="inline-flex items-center gap-2 text-xs text-[#738078]"><LockKeyhole className="h-3.5 w-3.5 text-[#c47b32]" /> Payment provider checkout is required before any charge</span>
            </div>
          </section>
        ) : (
          <p className="rounded-2xl border border-[#dce4e1] bg-white p-6 text-[#64716f]">No subscription is attached to this organization yet.</p>
        )}
        {data?.subscription && data.subscription.plan.monthlyPrice > 0 && (
          <section className="product-card mt-6 p-6">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#829086]"><CalendarRange className="h-4 w-4 text-[#c47b32]" /> Billing interval</p>
            <p className="mt-2 text-sm leading-6 text-[#64716f]">The interval decides the exact amount charged and the period it covers. {data.subscription.status === 'trialing' ? 'It takes effect when your trial converts.' : 'Changing it starts a fresh period today.'}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {INTERVAL_OPTIONS.map((option) => {
                const quote = computeQuote({ monthlyPrice: data.subscription!.plan.monthlyPrice, interval: option.key })
                const active = data.subscription!.billingInterval === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    disabled={savingInterval !== null}
                    onClick={() => changeInterval(option.key)}
                    className={`rounded-2xl border p-4 text-left transition disabled:cursor-wait ${active ? 'border-[#123c36] bg-[#123c36] text-[#f4f6f8]' : 'border-[#dce4e1] bg-white text-[#304237] hover:border-[#123c36]/40'}`}
                  >
                    <span className="flex items-center justify-between text-sm font-semibold">{option.label}{active && <Check className="h-4 w-4" aria-label="Current interval" />}</span>
                    <span className={`mt-2 block text-lg font-bold ${active ? 'text-white' : 'text-[#123c36]'}`}>{formatUgx(quote.total)}</span>
                    <span className={`mt-0.5 block text-[11px] ${active ? 'text-[#c4d0c5]' : 'text-[#829086]'}`}>{option.note}{option.key !== 'monthly' && ` · saves ${formatUgx(quote.savings)}`}</span>
                    {savingInterval === option.key && <Loader2 className="mt-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            {data.subscription.quote && (
              <p className="mt-4 rounded-xl bg-[#e9f0ee] px-4 py-3 text-xs leading-5 text-[#356247]">Current terms: {formatUgx(data.subscription.quote.total)} every {data.subscription.quote.monthsCovered === 1 ? 'month' : `${data.subscription.quote.monthsCovered} months`} (incl. VAT {formatUgx(data.subscription.quote.vatAmount)}) — covers {data.subscription.quote.periodStartLabel} → {data.subscription.quote.periodEndLabel}.</p>
            )}
          </section>
        )}
        {data && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <section className="product-card p-6">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#829086]"><ShieldCheck className="h-4 w-4 text-[#c47b32]" /> Lifecycle</p>
              <p className="mt-3 text-xl font-semibold capitalize text-[#123c36]">{data.organization?.status ?? 'unknown'}</p>
              <p className="mt-2 text-sm leading-6 text-[#64716f]">{data.organization?.status === 'trial' ? `Trial ends ${data.organization.trialEndsAt ? new Date(data.organization.trialEndsAt).toLocaleDateString() : 'soon'}.` : data.organization?.status === 'grace' ? 'Grace access is active. Update your plan to avoid suspension.' : 'Your organization access is governed by its current subscription.'}</p>
            </section>
            <section className="product-card p-6">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#829086]"><TrendingUp className="h-4 w-4 text-[#c47b32]" /> Capacity</p>
              <p className="mt-3 text-xl font-semibold text-[#123c36]">{data.usage.employeeCount} / {data.usage.employeeLimit ?? '∞'} employees</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e9f0ee]">
                <div className="h-full rounded-full bg-[#123c36] transition-all" style={{ width: `${capacityPercent}%` }} />
              </div>
              <p className="mt-2 text-sm leading-6 text-[#64716f]">{data.usage.canAddEmployee ? 'You can add employees within your current plan.' : 'Your employee capacity is full. Upgrade to add more.'}</p>
            </section>
          </div>
        )}
        {message && (
          <p role="status" className={`mt-5 rounded-xl border p-4 text-sm ${messageTone === 'error' ? 'border-[#b9433f]/30 bg-[#b9433f]/10 text-[#a52e27]' : 'border-[#356247]/30 bg-[#e9f0ee] text-[#356247]'}`}>{message}</p>
        )}
        <p className="mt-10 border-t border-[#dce4e1] pt-6 text-xs text-[#738078]">© {new Date().getFullYear()} Natural Intellects Ltd · NIWMS Workforce Management</p>
      </div>
    </main>
  )
}
