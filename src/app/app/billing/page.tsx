'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, BadgeCheck, CalendarRange, Check, Clock3, CreditCard, ExternalLink, Gift, Loader2, LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck, TrendingUp, XCircle } from 'lucide-react'
import Link from 'next/link'
import { computeQuote, type BillingInterval, type Quote } from '@/lib/billing/pricing'

type PaymentView = {
  id: string
  reference: string
  kind: string
  status: 'pending' | 'processing' | 'on_hold' | 'successful' | 'failed' | 'cancelled'
  amountUgx: number
  currency: string
  billingInterval: BillingInterval
  planName: string
  description: string
  checkoutUrl: string | null
  invoiceNumber: string | null
  providerTransactionId: string | null
  periodStart: string | null
  periodEnd: string | null
  mode: string | null
  failureReason: string | null
  failureCode: string | null
  initiatedAt: string
  completedAt: string | null
}

type BillingData = {
  organization: { status: string; billingMode?: string; trialEndsAt: string | null; graceEndsAt: string | null } | null
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
  payments?: PaymentView[]
}

const formatUgx = (value: number) => `UGX ${value.toLocaleString()}`

const INTERVAL_OPTIONS: Array<{ key: BillingInterval; label: string; note: string }> = [
  { key: 'monthly', label: 'Monthly', note: 'Billed every month' },
  { key: 'quarterly', label: 'Quarterly', note: 'Billed every 3 months · 5% off' },
  { key: 'annual', label: 'Annual', note: 'Billed yearly · 10% off' },
]

const STATUS_META: Record<PaymentView['status'], { label: string; className: string }> = {
  pending: { label: 'Awaiting payment', className: 'bg-[#c47b32]/10 text-[#b2761b] border-[#c47b32]/30' },
  processing: { label: 'Processing', className: 'bg-[#c47b32]/10 text-[#b2761b] border-[#c47b32]/30' },
  on_hold: { label: 'On hold', className: 'bg-[#c47b32]/10 text-[#b2761b] border-[#c47b32]/30' },
  successful: { label: 'Paid', className: 'bg-[#356247]/10 text-[#356247] border-[#356247]/30' },
  failed: { label: 'Failed', className: 'bg-[#b9433f]/10 text-[#a52e27] border-[#b9433f]/30' },
  cancelled: { label: 'Cancelled', className: 'bg-[#829086]/10 text-[#64716f] border-[#d2ddda]' },
}

const shortRef = (reference: string) => reference.slice(0, 8)

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'error'>('info')
  const [loading, setLoading] = useState(true)
  const [savingInterval, setSavingInterval] = useState<BillingInterval | null>(null)
  const [startingCheckout, setStartingCheckout] = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const verifyBusy = useRef(false)

  const loadBilling = useCallback(async () => {
    const response = await fetch('/api/billing', { credentials: 'include' })
    if (!response.ok) throw new Error('Unable to load billing details')
    return (await response.json()) as BillingData
  }, [])

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

  const refresh = useCallback(async () => {
    try {
      setData(await loadBilling())
    } catch (error) {
      setMessage((error as Error).message)
      setMessageTone('error')
    }
  }, [loadBilling])

  useEffect(() => {
    loadBilling()
      .then(setData)
      .catch((error: Error) => { setMessage(error.message); setMessageTone('error') })
      .finally(() => setLoading(false))
  }, [loadBilling])

  async function requestCancellation() {
    const response = await fetch('/api/billing', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) })
    const result = await response.json()
    setMessage(result.error ?? 'Cancellation scheduled for the end of the current billing period')
    setMessageTone(result.error ? 'error' : 'info')
    if (response.ok) setData((current) => current ? { ...current, subscription: current.subscription ? { ...current.subscription, cancelAtPeriodEnd: true } : null } : current)
  }

  // Nylon Pay hosted checkout: the server computes the amount from the
  // canonical plan, creates the payment, and returns the provider payment
  // link. The browser is redirected there — it is NEVER the authority for the
  // result; the billing state refreshes from the server via verification.
  async function startCheckout(planKey?: string, interval?: BillingInterval) {
    if (!data?.subscription || startingCheckout) return
    setStartingCheckout(true)
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_checkout', planCode: planKey ?? data.subscription.plan.key, interval: interval ?? data.subscription.billingInterval }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(result.error ?? 'Unable to start the Nylon Pay checkout right now.')
        setMessageTone('error')
        return
      }
      const checkoutUrl: string | null = result.payment?.checkoutUrl ?? null
      if (checkoutUrl) {
        window.location.href = checkoutUrl
        return
      }
      setMessage('The payment link was created but no checkout URL came back — please verify in a moment.')
      setMessageTone('error')
      await refresh()
    } finally {
      setStartingCheckout(false)
    }
  }

  // Server-side verification for one payment (also the reconciliation path
  // when the customer closes the hosted page before the webhook arrives).
  const verifyPayment = useCallback(async (paymentId: string, silent = false): Promise<boolean> => {
    if (verifyBusy.current) return false
    verifyBusy.current = true
    if (!silent) setVerifyingId(paymentId)
    try {
      const response = await fetch(`/api/billing/payments/${paymentId}/verify`, { method: 'POST', credentials: 'include' })
      const result = await response.json().catch(() => ({}))
      if (!silent) {
        const payment = result.payment as PaymentView | undefined
        if (!response.ok) {
          setMessage(result.error ?? 'Unable to verify the payment right now.')
          setMessageTone('error')
        } else if (payment?.status === 'successful') {
          setMessage('Payment confirmed — your subscription is active.')
          setMessageTone('info')
        } else if (payment && (payment.status === 'failed' || payment.status === 'cancelled')) {
          setMessage(`Payment ${payment.status}. No charge was applied${payment.failureReason ? ` — ${payment.failureReason}` : ''}. You can start a new checkout any time.`)
          setMessageTone('error')
        } else {
          setMessage('The payment is still awaiting confirmation by Nylon Pay. This page keeps checking automatically.')
          setMessageTone('info')
        }
      }
      await refresh()
      return response.ok && result.payment?.status === 'successful'
    } finally {
      verifyBusy.current = false
      setVerifyingId(null)
    }
  }, [refresh])

  const payments = data?.payments ?? []
  const openPayments = payments.filter((p) => p.status === 'pending' || p.status === 'processing' || p.status === 'on_hold')
  const latestOpen = openPayments[0] ?? null

  // Auto-verify loop while a payment is open — the page keeps asking the
  // server (which asks Nylon Pay) until the provider reaches a terminal state,
  // even if the customer returns from the hosted page without a redirect.
  useEffect(() => {
    if (!latestOpen) return
    let attempts = 0
    let cancelled = false
    const timer = setInterval(async () => {
      attempts += 1
      if (attempts > 40 || cancelled) { clearInterval(timer); return }
      const stillOpen = Date.parse(latestOpen.initiatedAt) // capture to satisfy lint; real check happens server-side
      void stillOpen
      const done = await verifyPayment(latestOpen.id, true)
      if (done) clearInterval(timer)
    }, 6000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [latestOpen?.id, verifyPayment])

  const capacityPercent = data?.usage.employeeLimit ? Math.min(100, Math.round((data.usage.employeeCount / data.usage.employeeLimit) * 100)) : 0
  const isExempt = data?.organization?.billingMode === 'exempt'
  const trialDaysLeft = data?.organization?.trialEndsAt
    ? Math.ceil((new Date(data.organization.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-5 py-10 text-[#17212b] lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-[#526158] transition hover:text-[#123c36]">
          <ArrowLeft className="h-4 w-4" /> Back to workspace
        </Link>
        <div className="mb-10 mt-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]"><span className="h-px w-8 bg-[#c47b32]" /> Billing &amp; subscription</p>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[#123c36]">Plan and capacity</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#64716f]">Manage your organization plan, lifecycle status, employee capacity, and Nylon Pay payments from one secure place.</p>
          </div>
          <span className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-[#123c36] text-[#f4f6f8] sm:flex"><CreditCard className="h-5 w-5" aria-hidden="true" /></span>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 text-[#64716f]"><RefreshCw className="h-4 w-4 animate-spin" /> Loading subscription…</div>
        ) : isExempt ? (
          <section className="product-card border-[#c47b32]/40 bg-gradient-to-br from-white via-white to-[#fbf4e4] p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#b2761b]"><Gift className="h-3.5 w-3.5" /> Complimentary access</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#123c36]">No payment required</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#64716f]">This organization has full platform access by a direct arrangement with Natural Intellects. No plan, billing interval, or payment method is needed, and the workspace is never paused or deleted by the subscription time engine.</p>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c47b32]/10 text-[#c47b32]"><Gift className="h-5 w-5" aria-hidden="true" /></span>
            </div>
            <p className="mt-6 flex items-center gap-2 border-t border-[#dce4e1] pt-5 text-xs text-[#738078]"><ShieldCheck className="h-3.5 w-3.5 text-[#c47b32]" /> Managed by the Natural Intellects platform owner</p>
          </section>
        ) : data?.subscription ? (
          <>
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
                  {data.subscription.status === 'trialing' && data.organization?.trialEndsAt && <p className="mt-1 text-xs text-[#b2761b]">Trial ends {new Date(data.organization.trialEndsAt).toLocaleDateString()}{trialDaysLeft !== null && trialDaysLeft >= 0 ? ` · ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left of your 14-day free trial` : ''}</p>}
                </div>
              </div>
              {data.subscription.status === 'trialing' || data.subscription.status === 'grace' ? (
                <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[#dce4e1] pt-6">
                  <button onClick={() => startCheckout()} disabled={startingCheckout} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#123c36] px-6 text-sm font-semibold text-[#f4f6f8] transition hover:bg-[#1d5249] disabled:cursor-not-allowed disabled:opacity-50">
                    {startingCheckout ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
                    {startingCheckout ? 'Opening Nylon Pay…' : `Pay now — ${data.subscription.quote ? formatUgx(data.subscription.quote.total) : 'secure checkout'}`}
                  </button>
                  <span className="inline-flex items-center gap-2 text-xs text-[#738078]"><LockKeyhole className="h-3.5 w-3.5 text-[#c47b32]" /> Secure checkout on Nylon Pay · mobile money, cards &amp; bank</span>
                </div>
              ) : null}
              {data.subscription.status === 'active' && (
                <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[#dce4e1] pt-6">
                  <button onClick={requestCancellation} className="inline-flex min-h-11 items-center rounded-full border border-[#d2ddda] px-5 text-sm font-medium text-[#356247] transition hover:bg-[#e9f0ee]">Cancel at period end</button>
                  <span className="inline-flex items-center gap-2 text-xs text-[#738078]"><BadgeCheck className="h-3.5 w-3.5 text-[#356247]" /> Subscription active — renewal invoices are raised automatically before each period ends</span>
                </div>
              )}
            </section>
            {latestOpen && (
              <section role="status" className="product-card mt-6 border-[#c47b32]/40 bg-gradient-to-br from-white via-white to-[#fbf4e4] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c47b32]/10 text-[#c47b32]"><Clock3 className="h-5 w-5 animate-pulse" aria-hidden="true" /></span>
                    <div>
                      <p className="text-sm font-semibold text-[#123c36]">Payment awaiting confirmation</p>
                      <p className="mt-1 text-sm leading-6 text-[#64716f]">{latestOpen.planName} · {formatUgx(latestOpen.amountUgx)} incl. VAT · ref {shortRef(latestOpen.reference)}… — this page checks Nylon Pay automatically every few seconds.</p>
                      {latestOpen.checkoutUrl && <a href={latestOpen.checkoutUrl} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#c47b32] transition hover:text-[#b2761b]"><ExternalLink className="h-3.5 w-3.5" /> Reopen the Nylon Pay payment page</a>}
                    </div>
                  </div>
                  <button onClick={() => verifyPayment(latestOpen.id)} disabled={verifyingId === latestOpen.id} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#c47b32]/40 px-5 text-sm font-semibold text-[#b2761b] transition hover:bg-[#c47b32]/10 disabled:cursor-wait disabled:opacity-60">
                    {verifyingId === latestOpen.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} Verify now
                  </button>
                </div>
              </section>
            )}
          </>
        ) : (
          <p className="rounded-2xl border border-[#dce4e1] bg-white p-6 text-[#64716f]">No subscription is attached to this organization yet.</p>
        )}
        {data?.subscription && !isExempt && data.subscription.plan.monthlyPrice > 0 && (
          <section className="product-card mt-6 p-6">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#829086]"><CalendarRange className="h-4 w-4 text-[#c47b32]" /> Billing interval</p>
            <p className="mt-2 text-sm leading-6 text-[#64716f]">The interval decides the exact amount charged and the period it covers. {data.subscription.status === 'trialing' ? 'While trialing, this sets the preference that will govern your first charge.' : 'Choosing an interval below opens a Nylon Pay checkout for exactly that amount — the new period starts once the payment is confirmed.'}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {INTERVAL_OPTIONS.map((option) => {
                const quote = computeQuote({ monthlyPrice: data.subscription!.plan.monthlyPrice, interval: option.key })
                const active = data.subscription!.billingInterval === option.key
                const isTrialing = data.subscription!.status === 'trialing'
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    disabled={savingInterval !== null || startingCheckout}
                    onClick={() => { void (isTrialing ? changeInterval(option.key) : startCheckout(undefined, option.key)) }}
                    className={`rounded-2xl border p-4 text-left transition disabled:cursor-wait ${active ? 'border-[#123c36] bg-[#123c36] text-[#f4f6f8]' : 'border-[#dce4e1] bg-white text-[#304237] hover:border-[#123c36]/40'}`}
                  >
                    <span className="flex items-center justify-between text-sm font-semibold">{option.label}{active && <Check className="h-4 w-4" aria-label="Current interval" />}</span>
                    <span className={`mt-2 block text-lg font-bold ${active ? 'text-white' : 'text-[#123c36]'}`}>{formatUgx(quote.total)}</span>
                    <span className={`mt-0.5 block text-[11px] ${active ? 'text-[#c4d0c5]' : 'text-[#829086]'}`}>{isTrialing ? option.note : `Pay now · covers ${quote.monthsCovered === 1 ? 'one month' : `${quote.monthsCovered} months`}`}{!isTrialing && option.key !== 'monthly' && ` · saves ${formatUgx(quote.savings)}`}</span>
                    {(savingInterval === option.key || (startingCheckout && !isTrialing)) && <Loader2 className="mt-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            {data.subscription.quote && (
              <p className="mt-4 rounded-xl bg-[#e9f0ee] px-4 py-3 text-xs leading-5 text-[#356247]">Current terms: {formatUgx(data.subscription.quote.total)} every {data.subscription.quote.monthsCovered === 1 ? 'month' : `${data.subscription.quote.monthsCovered} months`} (incl. VAT {formatUgx(data.subscription.quote.vatAmount)}) — covers {data.subscription.quote.periodStartLabel} → {data.subscription.quote.periodEndLabel}. Amounts are always computed server-side from the canonical plan.</p>
            )}
          </section>
        )}
        {payments.length > 0 && (
          <section className="product-card mt-6 p-6">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#829086]"><CreditCard className="h-4 w-4 text-[#c47b32]" /> Payment history</p>
            <p className="mt-2 text-sm leading-6 text-[#64716f]">Every payment attempt and its live Nylon Pay status. Amounts are the exact server-computed totals including VAT.</p>
            <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-[#dce4e1] [scrollbar-width:thin]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#f7f9f8] text-xs uppercase tracking-wider text-[#64716f]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Reference</th>
                    <th className="px-4 py-3 font-semibold sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ef]">
                  {payments.map((payment) => {
                    const meta = STATUS_META[payment.status]
                    return (
                      <tr key={payment.id} className="bg-white transition hover:bg-[#f9fbfa]">
                        <td className="whitespace-nowrap px-4 py-3 text-[#304237]">{new Date(payment.initiatedAt).toLocaleDateString()}<span className="ml-1 text-xs text-[#829086]">{new Date(payment.initiatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                        <td className="px-4 py-3 text-[#304237]">{payment.planName}<span className="ml-1.5 rounded-full bg-[#e9f0ee] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#356247]">{payment.billingInterval}</span>{payment.kind === 'renewal' && <span className="ml-1.5 rounded-full bg-[#c47b32]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#b2761b]">Renewal</span>}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#123c36]">{formatUgx(payment.amountUgx)}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{payment.status === 'successful' ? <BadgeCheck className="h-3 w-3" aria-hidden="true" /> : payment.status === 'failed' || payment.status === 'cancelled' ? <XCircle className="h-3 w-3" aria-hidden="true" /> : <Clock3 className="h-3 w-3" aria-hidden="true" />}{meta.label}</span></td>
                        <td className="px-4 py-3 font-mono text-xs text-[#64716f]" title={payment.reference}>{shortRef(payment.reference)}…</td>
                        <td className="px-4 py-3 text-right">
                          {(payment.status === 'pending' || payment.status === 'processing' || payment.status === 'on_hold') && (
                            <button onClick={() => verifyPayment(payment.id)} disabled={verifyingId === payment.id} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#d2ddda] px-3 text-xs font-semibold text-[#356247] transition hover:bg-[#e9f0ee] disabled:cursor-wait disabled:opacity-60">
                              {verifyingId === payment.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />} Verify
                            </button>
                          )}
                          {payment.checkoutUrl && payment.status !== 'successful' && payment.status !== 'failed' && payment.status !== 'cancelled' && (
                            <a href={payment.checkoutUrl} className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-[#c47b32] transition hover:text-[#b2761b]"><ExternalLink className="h-3 w-3" /> Pay</a>
                          )}
                          {(payment.status === 'failed' || payment.status === 'cancelled') && (
                            <button onClick={() => startCheckout()} disabled={startingCheckout} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#123c36] px-3 text-xs font-semibold text-[#f4f6f8] transition hover:bg-[#1d5249] disabled:cursor-wait disabled:opacity-60">
                              <ShieldAlert className="h-3 w-3" aria-hidden="true" /> Try again
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {data && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <section className="product-card p-6">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#829086]"><ShieldCheck className="h-4 w-4 text-[#c47b32]" /> Lifecycle</p>
              <p className="mt-3 text-xl font-semibold capitalize text-[#123c36]">{data.organization?.status ?? 'unknown'}</p>
              <p className="mt-2 text-sm leading-6 text-[#64716f]">{isExempt ? 'Complimentary access is active — this workspace is never paused or deleted.' : data.organization?.status === 'trial' ? `Trial ends ${data.organization.trialEndsAt ? new Date(data.organization.trialEndsAt).toLocaleDateString() : 'soon'}${trialDaysLeft !== null && trialDaysLeft >= 0 ? ` — ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} of your 14-day free trial remain` : ''}.` : data.organization?.status === 'grace' ? 'Grace access is active. Complete payment to reactivate the workspace.' : 'Your organization access is governed by its current subscription.'}</p>
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
        <p className="mt-10 border-t border-[#dce4e1] pt-6 text-xs text-[#738078]">© {new Date().getFullYear()} Natural Intellects Ltd · NIWMS Workforce Management · Payments processed securely by Nylon Pay</p>
      </div>
    </main>
  )
}
