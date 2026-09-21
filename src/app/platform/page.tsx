'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, Users, FileText, CreditCard, ShieldAlert, ArrowLeft, RefreshCw, Search, CalendarClock, Inbox, UserPlus, KeyRound, Copy, Check, X, Loader2, Sparkles, Hourglass, Mail, ChevronDown, AlertCircle, Eye, AlignLeft, Banknote, MoreHorizontal, PauseCircle, Power, ShieldX, Timer, Trash2, Ban } from 'lucide-react'

type OrganizationRow = {
  id: string
  name: string
  slug: string
  status: string
  organizationType: string
  createdAt: string
  trialEndsAt: string
  graceEndsAt: string | null
  bannedAt: string | null
  bannedReason: string | null
  memberCount: number
  subscription: {
    status: string
    billingInterval: string
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    planName: string | null
    monthlyPriceCents: number
  } | null
}

type Overview = {
  metrics: {
    organizations: number
    activeOrganizations: number
    paidClients: number
    trials: number
    paused: number
    suspended: number
    banned: number
    estimatedMrrCents: number
    customPricedClients: number
    upcomingRenewals: number
    employees: number
    reports: number
    pendingTrialRequests: number
    billingEvents: number
  }
  gracePeriodDays: number
  organizations: OrganizationRow[]
}

type TrialRequest = {
  id: string
  organizationName: string
  contactName: string
  contactEmail: string
  industry: string
  status: 'pending' | 'approved' | 'dismissed'
  reviewedAt: string | null
  notes: string | null
  provisionedOrgId: string | null
  createdAt: string
}

type ProvisionResult = {
  organization: { id: string; name: string; slug: string; trialEndsAt: string }
  adminUsername: string
  temporaryPassword: string
  email: { status: string; provider: string } | null
  message: string
}

type EmailRow = {
  id: string
  organizationId: string | null
  toEmail: string
  subject: string
  body: string
  html: string | null
  category: string
  status: string
  provider: string
  error: string | null
  createdAt: string
  sentAt: string | null
}

type ConfirmState =
  | { kind: 'ban'; organization: OrganizationRow }
  | { kind: 'purge'; organization: OrganizationRow }
  | null

type OwnerAction = 'ban' | 'unban' | 'suspend' | 'reactivate' | 'extend' | 'purge'

// NI product palette — dark control-plane variant (green-tinted, gold accents)
const T = {
  page: 'bg-[#0f1a17] text-[#f4f1e8]',
  surface: 'bg-[#152520] border-[#2a4237]',
  border: 'border-[#2a4237]',
  muted: 'text-[#a8b8b0]',
  faint: 'text-[#7f948a]',
  brand: 'text-[#e9b44c]',
  positive: 'text-[#7fc9a6]',
}

function formatUgx(cents: number): string {
  return `UGX ${Math.round(cents / 100).toLocaleString('en-US')}`
}

function LifecycleBadge({ status }: { status: string }) {
  const normalized = (status || '').toLowerCase()
  const styles: Record<string, string> = {
    trial: 'bg-[#e9b44c]/10 text-[#e9b44c] border-[#e9b44c]/30',
    trialing: 'bg-[#e9b44c]/10 text-[#e9b44c] border-[#e9b44c]/30',
    active: 'bg-[#7fc9a6]/10 text-[#7fc9a6] border-[#7fc9a6]/30',
    grace: 'bg-[#e2705f]/10 text-[#f0a08f] border-[#e2705f]/30',
    grace_period: 'bg-[#e2705f]/10 text-[#f0a08f] border-[#e2705f]/30',
    past_due: 'bg-[#e9b44c]/10 text-[#e9b44c] border-[#e9b44c]/30',
    expired: 'bg-[#e2705f]/10 text-[#e2705f] border-[#e2705f]/30',
    suspended: 'bg-[#e2705f]/10 text-[#e2705f] border-[#e2705f]/30',
    banned: 'bg-[#e2705f]/20 text-[#e2705f] border-[#e2705f]/60',
    archived: 'bg-white/5 text-[#7f948a] border-white/15',
  }
  const cls = styles[normalized] ?? 'bg-white/5 text-[#a8b8b0] border-white/15'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>{normalized.replace(/_/g, ' ') || 'unknown'}</span>
}

// Deadline chip: urgency-colored time remaining with the exact date underneath.
function DeadlineChip({ endsAt, label, active }: { endsAt: string; label: string; active: boolean }) {
  if (!active) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${T.muted}`}>
        <CalendarClock className="h-3.5 w-3.5" />
        {new Date(endsAt).toLocaleDateString()}
      </span>
    )
  }
  const daysLeft = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000)
  const expired = daysLeft < 0
  const today = daysLeft === 0
  const soon = daysLeft > 0 && daysLeft <= 3
  const winding = daysLeft > 3 && daysLeft <= 7
  const chip = expired
    ? 'border-[#e2705f]/40 bg-[#e2705f]/10 text-[#e2705f]'
    : today || soon
      ? 'border-[#e2705f]/30 bg-[#e2705f]/5 text-[#f0a08f]'
      : winding
        ? 'border-[#e9b44c]/40 bg-[#e9b44c]/10 text-[#e9b44c]'
        : 'border-white/15 bg-white/5 text-[#d8e2dc]'
  const value = expired ? 'Overdue' : today ? 'Ends today' : `${daysLeft}d left`
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${chip}`} title={`${label} ${new Date(endsAt).toLocaleDateString()}`}>
        <Hourglass className="h-3 w-3" />
        {value}
      </span>
      <span className={`text-[11px] ${T.faint}`}>{label}{new Date(endsAt).toLocaleDateString()}</span>
    </span>
  )
}

function RequestStatusChip({ status }: { status: TrialRequest['status'] }) {
  const styles: Record<TrialRequest['status'], string> = {
    pending: 'bg-[#e9b44c]/10 text-[#e9b44c] border-[#e9b44c]/40',
    approved: 'bg-[#7fc9a6]/10 text-[#7fc9a6] border-[#7fc9a6]/40',
    dismissed: 'bg-white/5 text-[#7f948a] border-white/15',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  )
}

const EMAIL_CATEGORY_STYLES: Record<string, string> = {
  trial_credentials: 'border-[#e9b44c]/40 bg-[#e9b44c]/10 text-[#e9b44c]',
  trial_warning: 'border-[#e2705f]/40 bg-[#e2705f]/10 text-[#e2705f]',
  daily_digest: 'border-[#7fc9a6]/40 bg-[#7fc9a6]/10 text-[#7fc9a6]',
  password_changed: 'border-white/15 bg-white/5 text-[#d8e2dc]',
  system: 'border-white/15 bg-white/5 text-[#a8b8b0]',
}

function EmailCategoryChip({ category }: { category: string }) {
  const cls = EMAIL_CATEGORY_STYLES[category] ?? 'border-white/15 bg-white/5 text-[#a8b8b0]'
  const label = category.replace(/_/g, ' ')
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
}

function timeAgoLabel(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// The intelligent time-frame cell: shows whichever clock actually governs the client.
function TimeFrameCell({ organization }: { organization: OrganizationRow }) {
  const status = organization.status
  if (status === 'banned') {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2705f]/60 bg-[#e2705f]/15 px-2.5 py-0.5 text-xs font-semibold text-[#e2705f]">
          <Ban className="h-3 w-3" /> Banned
        </span>
        {organization.bannedAt && <span className={`text-[11px] ${T.faint}`}>{new Date(organization.bannedAt).toLocaleDateString()}{organization.bannedReason ? ` · ${organization.bannedReason.slice(0, 60)}` : ''}</span>}
      </span>
    )
  }
  if (status === 'suspended') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2705f]/30 bg-[#e2705f]/5 px-2.5 py-0.5 text-xs text-[#f0a08f]">
        <PauseCircle className="h-3 w-3" /> Turned off
      </span>
    )
  }
  if (status === 'grace') {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2705f]/40 bg-[#e2705f]/10 px-2.5 py-0.5 text-xs font-medium text-[#f0a08f]">
          <PauseCircle className="h-3 w-3" /> Paused · data held
        </span>
        {organization.graceEndsAt && <DeadlineChip endsAt={organization.graceEndsAt} label="Deleted after " active />}
      </span>
    )
  }
  if (status === 'trial' || organization.subscription?.status === 'trialing') {
    return <DeadlineChip endsAt={organization.trialEndsAt} label="Trial ends " active />
  }
  const periodEnd = organization.subscription?.currentPeriodEnd
  if (status === 'active' && periodEnd) {
    return <DeadlineChip endsAt={periodEnd} label="Paid until " active />
  }
  return <span className={T.faint}>—</span>
}

export default function PlatformPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [trialRequests, setTrialRequests] = useState<TrialRequest[]>([])
  const [pendingRequests, setPendingRequests] = useState(0)
  const [actingId, setActingId] = useState<string | null>(null)
  const [provisioned, setProvisioned] = useState<ProvisionResult | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [emailsTotal, setEmailsTotal] = useState(0)
  const [emailsFailed, setEmailsFailed] = useState(0)
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null)
  // Per-email body rendering: plain text (default) or the branded HTML preview.
  const [emailPreviewMode, setEmailPreviewMode] = useState<Record<string, boolean>>({})
  // Client management state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [customDays, setCustomDays] = useState('')
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const [confirmReason, setConfirmReason] = useState('')
  const [confirmSlug, setConfirmSlug] = useState('')
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const flashTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [overviewResponse, requestsResponse, emailsResponse] = await Promise.all([
      fetch('/api/platform/overview', { credentials: 'include' }),
      fetch('/api/platform/trial-requests', { credentials: 'include' }),
      fetch('/api/platform/emails?limit=20', { credentials: 'include' }),
    ])
    if (!overviewResponse.ok) {
      setError(overviewResponse.status === 403 ? 'This area is restricted to Natural Intellects platform administrators.' : 'Sign in with a platform administrator account to continue.')
      setLoading(false)
      return
    }
    setData(await overviewResponse.json())
    if (requestsResponse.ok) {
      const body = await requestsResponse.json() as { requests: TrialRequest[]; pendingCount: number }
      setTrialRequests(body.requests)
      setPendingRequests(body.pendingCount)
    }
    if (emailsResponse.ok) {
      const body = await emailsResponse.json() as { emails: EmailRow[]; total: number; failedCount: number }
      setEmails(body.emails)
      setEmailsTotal(body.total)
      setEmailsFailed(body.failedCount)
    }
    setError('')
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    }
  }, [])

  function showFlash(tone: 'ok' | 'err', text: string) {
    setFlash({ tone, text })
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 6000)
  }

  async function act(request: TrialRequest, action: 'approve' | 'dismiss') {
    setActingId(request.id)
    try {
      const response = await fetch(`/api/platform/trial-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        window.alert(body.error ?? 'Action failed. Please refresh and try again.')
        return
      }
      if (action === 'approve') {
        setProvisioned(body as ProvisionResult)
        setPasswordCopied(false)
      }
      await load()
    } finally {
      setActingId(null)
    }
  }

  function copyCredentials() {
    if (!provisioned) return
    const text = `NIWMS workspace: ${provisioned.organization.name}\nLogin: ${window.location.origin}/login\nAdmin email: ${provisioned.adminUsername}\nTemporary password: ${provisioned.temporaryPassword}\n(One-time secret — ask the customer to change it after first sign-in.)`
    void navigator.clipboard?.writeText(text)
    setPasswordCopied(true)
  }

  // Owner control action against a client organization.
  async function runOwnerAction(organization: OrganizationRow, action: OwnerAction, options: { days?: number; reason?: string } = {}) {
    setActingId(organization.id)
    setOpenMenuId(null)
    try {
      const response = await fetch(`/api/platform/organizations/${organization.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, ...options }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        showFlash('err', body.error ?? 'Action failed.')
        return
      }
      showFlash('ok', body.message ?? 'Done.')
      setConfirmState(null)
      setConfirmReason('')
      setConfirmSlug('')
      await load()
    } finally {
      setActingId(null)
    }
  }

  const organizations = data?.organizations ?? []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = organizations
    if (q) rows = rows.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
    if (statusFilter !== 'all') rows = rows.filter((o) => o.status === statusFilter)
    return rows
  }, [organizations, query, statusFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: organizations.length }
    for (const organization of organizations) counts[organization.status] = (counts[organization.status] ?? 0) + 1
    return counts
  }, [organizations])

  if (loading) {
    return (
      <main className={`min-h-screen ${T.page} p-6 sm:p-10`}>
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="h-24 animate-pulse rounded-xl bg-[#152520]/70" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-[#152520]/70" />)}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-[#152520]/70" />
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${T.page} p-6`}>
        <div className={`max-w-md rounded-xl border ${T.surface} p-8`}>
          <ShieldAlert className="mb-5 h-7 w-7 text-[#e9b44c]" />
          <h1 className="text-2xl font-semibold">Access restricted</h1>
          <p className="mt-3 text-sm leading-6 text-[#a8b8b0]">{error}</p>
          <Link href="/login" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#e9b44c] hover:underline">Go to login <ArrowLeft className="h-4 w-4" /></Link>
        </div>
      </main>
    )
  }

  const metrics = data?.metrics
  const graceDays = data?.gracePeriodDays ?? 30
  const cards = [
    { label: 'Organizations', value: metrics?.organizations, icon: Building2, accent: 'text-[#e9b44c] bg-[#e9b44c]/10' },
    { label: 'Active employees', value: metrics?.employees, icon: Users, accent: 'text-[#7fc9a6] bg-[#7fc9a6]/10' },
    { label: 'Organizations on trial', value: metrics?.trials, icon: CreditCard, accent: 'text-[#e9b44c] bg-[#e9b44c]/10' },
    { label: 'Reports generated', value: metrics?.reports, icon: FileText, accent: 'text-[#7fc9a6] bg-[#7fc9a6]/10' },
  ]
  const incomeCards = [
    { label: 'Estimated MRR', value: metrics ? formatUgx(metrics.estimatedMrrCents) : '—', hint: `${metrics?.paidClients ?? 0} paying client${(metrics?.paidClients ?? 0) === 1 ? '' : 's'} · interval-normalized${(metrics?.customPricedClients ?? 0) > 0 ? ` · ${(metrics?.customPricedClients ?? 0)} on custom pricing excluded` : ''}`, icon: Banknote, accent: 'text-[#7fc9a6] bg-[#7fc9a6]/10' },
    { label: 'Paused clients', value: metrics?.paused, hint: `Data held ${graceDays} days, then purged`, icon: PauseCircle, accent: 'text-[#f0a08f] bg-[#e2705f]/10' },
    { label: 'Banned / off', value: (metrics?.banned ?? 0) + (metrics?.suspended ?? 0), hint: 'Sign-in blocked · data retained', icon: ShieldX, accent: 'text-[#e2705f] bg-[#e2705f]/10' },
    { label: 'Renewals ≤ 30 days', value: metrics?.upcomingRenewals, hint: `${metrics?.billingEvents ?? 0} billing events recorded`, icon: Timer, accent: 'text-[#e9b44c] bg-[#e9b44c]/10' },
  ]

  const filterChips = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'trial', label: 'Trial' },
    { key: 'grace', label: 'Paused' },
    { key: 'suspended', label: 'Off' },
    { key: 'banned', label: 'Banned' },
  ]

  return (
    <main className={`min-h-screen ${T.page}`}>
      <header className={`sticky top-0 z-10 border-b ${T.border} bg-[#12211d]/95 backdrop-blur`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e9b44c]">Natural Intellects</p>
            <h1 className="mt-1 text-xl font-semibold">Control Center</h1>
          </div>
          <button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#3a5548] px-4 text-sm transition-colors hover:bg-[#1d332b]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Metric cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, accent }) => (
            <div key={label} className={`rounded-xl border ${T.surface} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3a5548] hover:shadow-lg hover:shadow-black/20`}>
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-6 text-3xl font-semibold tabular-nums">{value ?? 0}</p>
              <p className={`mt-2 text-sm ${T.muted}`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Income + lifecycle controls */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {incomeCards.map(({ label, value, hint, icon: Icon, accent }) => (
            <div key={label} className={`rounded-xl border ${T.surface} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#3a5548] hover:shadow-lg hover:shadow-black/20`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-widest ${T.faint}`}>Time engine</span>
              </div>
              <p className="mt-6 text-2xl font-semibold tabular-nums">{value ?? 0}</p>
              <p className={`mt-2 text-sm ${T.muted}`}>{label}</p>
              <p className={`mt-1 text-xs ${T.faint}`}>{hint}</p>
            </div>
          ))}
        </div>

        {/* Trial request pipeline */}
        <section className={`mt-10 overflow-hidden rounded-xl border ${T.surface}`}>
          <div className={`flex flex-col gap-3 border-b ${T.border} px-5 py-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e9b44c]/10 text-[#e9b44c]"><Inbox className="h-4.5 w-4.5" /></span>
              <div>
                <h2 className="flex items-center gap-2 font-semibold">Trial requests
                  {pendingRequests > 0 && (
                    <span className="inline-flex min-h-5 items-center rounded-full bg-[#e9b44c] px-2 text-[11px] font-bold tabular-nums text-[#0f1a17]">{pendingRequests} pending</span>
                  )}
                </h2>
                <p className={`mt-1 text-sm ${T.muted}`}>Requests from the marketing site. Approving provisions a 14-day trial workspace instantly.</p>
              </div>
            </div>
            <span className="hidden text-xs uppercase tracking-widest text-[#7f948a] sm:inline">Commercial pipeline</span>
          </div>

          {provisioned && (
            <div className="mx-5 mt-4 rounded-lg border border-[#7fc9a6]/40 bg-[#7fc9a6]/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#7fc9a6]" />
                  <div>
                    <p className="text-sm font-semibold text-[#7fc9a6]">Workspace provisioned — {provisioned.organization.name}</p>
                    <p className={`mt-1 text-xs ${T.muted}`}>Share these credentials with the customer. The password is shown only once.</p>
                  </div>
                </div>
                <button onClick={() => setProvisioned(null)} aria-label="Dismiss credentials panel" className="rounded p-1 text-[#7f948a] transition-colors hover:text-[#f4f1e8]"><X className="h-4 w-4" /></button>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-md bg-[#0f1a17]/60 px-3 py-2"><dt className={T.muted}>Admin email</dt><dd className="font-mono text-[#f4f1e8]">{provisioned.adminUsername}</dd></div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-[#0f1a17]/60 px-3 py-2"><dt className={T.muted}>Temporary password</dt><dd className="font-mono font-semibold text-[#e9b44c]">{provisioned.temporaryPassword}</dd></div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-[#0f1a17]/60 px-3 py-2"><dt className={T.muted}>Workspace slug</dt><dd className="font-mono text-[#f4f1e8]">{provisioned.organization.slug}</dd></div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-[#0f1a17]/60 px-3 py-2"><dt className={T.muted}>Trial ends</dt><dd className="tabular-nums text-[#f4f1e8]">{new Date(provisioned.organization.trialEndsAt).toLocaleDateString()}</dd></div>
              </dl>
              <button onClick={copyCredentials} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#7fc9a6]/40 px-3 text-xs font-semibold text-[#7fc9a6] transition-colors hover:bg-[#7fc9a6]/10">
                {passwordCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {passwordCopied ? 'Copied to clipboard' : 'Copy credentials for handover'}
              </button>
              {provisioned.email && (
                <p className={`mt-2 inline-flex items-center gap-1.5 text-xs ${provisioned.email.status === 'sent' ? 'text-[#7fc9a6]' : 'text-[#e9b44c]'}`}>
                  {provisioned.email.status === 'sent'
                    ? <><Mail className="h-3.5 w-3.5" /> Credentials emailed to {provisioned.adminUsername} via {provisioned.email.provider} — see the outbox below.</>
                    : <><AlertCircle className="h-3.5 w-3.5" /> Email delivery failed — use “Copy credentials for handover” instead.</>}
                </p>
              )}
            </div>
          )}

          <ul className="divide-y divide-[#21362e]">
            {trialRequests.slice(0, 6).map((trialRequest) => (
              <li key={trialRequest.id} className={`relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[#1b2e27] lg:flex-row lg:items-center lg:justify-between ${trialRequest.status === 'pending' ? 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[#e9b44c]' : ''}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{trialRequest.organizationName}</p>
                    <RequestStatusChip status={trialRequest.status} />
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-[#a8b8b0]">{trialRequest.industry}</span>
                  </div>
                  <p className={`mt-1 truncate text-xs ${T.muted}`}>
                    {trialRequest.contactName} · <span className="font-mono">{trialRequest.contactEmail}</span> · requested {timeAgoLabel(trialRequest.createdAt)}
                    {trialRequest.reviewedAt && trialRequest.status === 'approved' && <span title={new Date(trialRequest.reviewedAt).toLocaleString()}> · provisioned {timeAgoLabel(trialRequest.reviewedAt)}</span>}
                  </p>
                </div>
                {trialRequest.status === 'pending' ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => void act(trialRequest, 'approve')}
                      disabled={actingId === trialRequest.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#e9b44c] px-3.5 text-xs font-bold text-[#0f1a17] shadow-sm shadow-black/20 transition-all hover:-translate-y-px hover:bg-[#f0c26a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9b44c] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      {actingId === trialRequest.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      Approve &amp; provision
                    </button>
                    <button
                      onClick={() => void act(trialRequest, 'dismiss')}
                      disabled={actingId === trialRequest.id}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#3a5548] px-3.5 text-xs font-semibold text-[#a8b8b0] transition hover:bg-[#1d332b] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <span className={`shrink-0 text-xs ${T.faint}`}>{trialRequest.status === 'approved' ? 'Workspace created' : 'No action'}</span>
                )}
              </li>
            ))}
          </ul>
          {trialRequests.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Sparkles className={`h-6 w-6 ${T.faint}`} />
              <p className={`text-sm ${T.muted}`}>No trial requests yet. New requests from the marketing site appear here.</p>
            </div>
          )}
        </section>

        {/* Email outbox */}
        <section className={`mt-8 overflow-hidden rounded-xl border ${T.surface}`}>
          <div className={`flex flex-col gap-3 border-b ${T.border} px-5 py-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7fc9a6]/10 text-[#7fc9a6]"><Mail className="h-4.5 w-4.5" /></span>
              <div>
                <h2 className="flex flex-wrap items-center gap-2 font-semibold">Email outbox
                  <span className="inline-flex min-h-5 items-center rounded-full border border-white/15 bg-white/5 px-2 text-[11px] font-semibold tabular-nums text-[#a8b8b0]">{emailsTotal} total</span>
                  {emailsFailed > 0 && (
                    <span className="inline-flex min-h-5 items-center rounded-full border border-[#e2705f]/40 bg-[#e2705f]/10 px-2 text-[11px] font-semibold tabular-nums text-[#e2705f]">{emailsFailed} failed</span>
                  )}
                </h2>
                <p className={`mt-1 text-sm ${T.muted}`}>Trial credentials, daily digests, and lifecycle warnings. Outbox mode records each delivery here; switch EMAIL_PROVIDER to smtp for real sends.</p>
              </div>
            </div>
            <span className="hidden text-xs uppercase tracking-widest text-[#7f948a] sm:inline">Delivery log</span>
          </div>

          <ul className="divide-y divide-[#21362e]">
            {emails.map((email) => {
              const expanded = expandedEmailId === email.id
              return (
                <li key={email.id} className="transition-colors hover:bg-[#1b2e27]">
                  <button
                    onClick={() => setExpandedEmailId(expanded ? null : email.id)}
                    aria-expanded={expanded}
                    className="flex w-full flex-col gap-2 px-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e9b44c] lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[#7f948a] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{email.subject}</p>
                        <p className={`mt-0.5 truncate text-xs ${T.muted}`}>
                          To <span className="font-mono">{email.toEmail}</span> · {timeAgoLabel(email.createdAt)} · via {email.provider}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pl-8">
                      <EmailCategoryChip category={email.category} />
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${email.status === 'sent' ? 'border-[#7fc9a6]/30 bg-[#7fc9a6]/10 text-[#7fc9a6]' : 'border-[#e2705f]/40 bg-[#e2705f]/10 text-[#e2705f]'}`}>
                        {email.status}
                      </span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-5 pb-5 lg:pl-14">
                      <div className="rounded-lg border border-[#2a4237] bg-[#0f1a17]/70 p-4">
                        {email.html && (
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#7f948a]">Message body</span>
                            <div className="inline-flex overflow-hidden rounded-full border border-[#2a4237]" role="group" aria-label="Body rendering mode">
                              <button
                                type="button"
                                onClick={() => setEmailPreviewMode((modes) => ({ ...modes, [email.id]: false }))}
                                aria-pressed={!emailPreviewMode[email.id]}
                                className={`inline-flex min-h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors ${!emailPreviewMode[email.id] ? 'bg-[#e9b44c]/15 text-[#e9b44c]' : 'text-[#7f948a] hover:bg-white/5 hover:text-[#a8b8b0]'}`}
                              >
                                <AlignLeft className="h-3.5 w-3.5" />
                                Text
                              </button>
                              <button
                                type="button"
                                onClick={() => setEmailPreviewMode((modes) => ({ ...modes, [email.id]: true }))}
                                aria-pressed={!!emailPreviewMode[email.id]}
                                className={`inline-flex min-h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors ${emailPreviewMode[email.id] ? 'bg-[#e9b44c]/15 text-[#e9b44c]' : 'text-[#7f948a] hover:bg-white/5 hover:text-[#a8b8b0]'}`}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Preview
                              </button>
                            </div>
                          </div>
                        )}
                        {email.html && emailPreviewMode[email.id] ? (
                          <iframe
                            srcDoc={email.html}
                            sandbox=""
                            title={`Preview of ${email.subject}`}
                            className="h-[380px] w-full rounded-md border border-[#2a4237] bg-white"
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#d8e2dc]">{email.body}</pre>
                        )}
                        {email.error && (
                          <p className="mt-3 flex items-start gap-2 rounded-md border border-[#e2705f]/40 bg-[#e2705f]/10 px-3 py-2 text-xs text-[#e2705f]">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {email.error}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {emails.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Mail className={`h-6 w-6 ${T.faint}`} />
              <p className={`text-sm ${T.muted}`}>No emails yet. Approving a trial, daily digests, and trial warnings all land here.</p>
            </div>
          )}
        </section>

        {/* Client management */}
        <section className={`mt-8 overflow-hidden rounded-xl border ${T.surface}`}>
          <div className={`flex flex-col gap-4 border-b ${T.border} px-5 py-4 lg:flex-row lg:items-center lg:justify-between`}>
            <div>
              <h2 className="font-semibold">Clients</h2>
              <p className={`mt-1 text-sm ${T.muted}`}>Every workspace with its income plan and time frame. Ban, turn off, extend time, or purge — the engine pauses expired clients automatically and deletes their data after {graceDays} days without payment.</p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f948a]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients..."
                  aria-label="Search clients"
                  className="h-10 w-56 rounded-lg border border-[#3a5548] bg-[#0f1a17] pl-9 pr-3 text-sm text-[#f4f1e8] placeholder:text-[#5f7269] focus:border-[#e9b44c]/60 focus:outline-none"
                />
              </div>
              <span className="hidden text-xs uppercase tracking-widest text-[#7fc9a6] sm:inline">Live data</span>
            </div>
          </div>

          {/* Status filter chips */}
          <div className="flex flex-wrap gap-2 border-b border-[#21362e] px-5 py-3">
            {filterChips.map((chip) => {
              const count = statusCounts[chip.key] ?? 0
              const activeFilter = statusFilter === chip.key
              return (
                <button
                  key={chip.key}
                  onClick={() => setStatusFilter(chip.key)}
                  aria-pressed={activeFilter}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${activeFilter ? 'border-[#e9b44c]/60 bg-[#e9b44c]/15 text-[#e9b44c]' : 'border-white/10 bg-white/5 text-[#a8b8b0] hover:border-[#3a5548] hover:text-[#d8e2dc]'}`}
                >
                  {chip.label}
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              )
            })}
          </div>

          {flash && (
            <p role="status" className={`mx-5 mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${flash.tone === 'ok' ? 'border-[#7fc9a6]/40 bg-[#7fc9a6]/5 text-[#7fc9a6]' : 'border-[#e2705f]/40 bg-[#e2705f]/10 text-[#f0a08f]'}`}>
              {flash.tone === 'ok' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              {flash.text}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className={`text-xs uppercase tracking-wider ${T.faint}`}>
                <tr className={`border-b ${T.border}`}>
                  <th className="px-5 py-4">Client</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Plan</th>
                  <th className="px-5 py-4">Members</th>
                  <th className="px-5 py-4">Time frame</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((organization) => {
                  const menuOpen = openMenuId === organization.id
                  const isLegacy = organization.organizationType === 'LEGACY'
                  return (
                    <tr key={organization.id} className="border-b border-[#21362e] transition-colors last:border-0 hover:bg-[#1b2e27]">
                      <td className="px-5 py-4">
                        <p className="flex items-center gap-2 font-medium">
                          {organization.name}
                          {isLegacy && <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7f948a]">Legacy</span>}
                        </p>
                        <p className={`text-xs ${T.faint}`}>{organization.slug} · joined {new Date(organization.createdAt).toLocaleDateString()}</p>
                      </td>
                      <td className="px-5 py-4"><LifecycleBadge status={organization.status} /></td>
                      <td className="px-5 py-4">
                        {organization.subscription ? (
                          <span className="inline-flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs text-[#d8e2dc]">{organization.subscription.planName ?? 'Unassigned'}</span>
                              {organization.subscription.status === 'active' && organization.subscription.monthlyPriceCents > 0 && (
                                <span className="text-[11px] tabular-nums text-[#7fc9a6]">{formatUgx(organization.subscription.monthlyPriceCents)}/mo</span>
                              )}
                            </span>
                            <span className={`text-[11px] ${T.faint}`}>{organization.subscription.billingInterval} · {organization.subscription.status}</span>
                          </span>
                        ) : <span className={T.faint}>No plan</span>}
                      </td>
                      <td className="px-5 py-4 tabular-nums">{organization.memberCount}</td>
                      <td className="px-5 py-4"><TimeFrameCell organization={organization} /></td>
                      <td className="relative px-5 py-4 text-right">
                        <button
                          onClick={() => { setOpenMenuId(menuOpen ? null : organization.id); setCustomDays('') }}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-label={`Actions for ${organization.name}`}
                          disabled={actingId === organization.id}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#3a5548] px-3 text-xs font-semibold text-[#d8e2dc] transition hover:bg-[#1d332b] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actingId === organization.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                          Manage
                        </button>
                        {menuOpen && (
                          <>
                            <button aria-hidden tabIndex={-1} onClick={() => setOpenMenuId(null)} className="fixed inset-0 z-20 cursor-default" />
                            <div role="menu" aria-label={`Manage ${organization.name}`} className="absolute right-5 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-[#3a5548] bg-[#12211d] py-1.5 text-left shadow-2xl shadow-black/40">
                              <p className={`px-3 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest ${T.faint}`}>Extend time</p>
                              {[7, 30, 90].map((days) => (
                                <button
                                  key={days}
                                  role="menuitem"
                                  onClick={() => void runOwnerAction(organization, 'extend', { days })}
                                  className="flex min-h-9 w-full items-center gap-2.5 px-3 text-xs text-[#d8e2dc] transition-colors hover:bg-[#1d332b]"
                                >
                                  <Timer className="h-3.5 w-3.5 text-[#7fc9a6]" /> +{days} days
                                </button>
                              ))}
                              <div className="flex items-center gap-1.5 px-3 py-1.5">
                                <input
                                  value={customDays}
                                  onChange={(e) => setCustomDays(e.target.value.replace(/[^0-9]/g, ''))}
                                  placeholder="Custom days"
                                  aria-label={`Custom extension days for ${organization.name}`}
                                  className="h-8 w-full rounded-md border border-[#3a5548] bg-[#0f1a17] px-2 text-xs text-[#f4f1e8] placeholder:text-[#5f7269] focus:border-[#e9b44c]/60 focus:outline-none"
                                />
                                <button
                                  onClick={() => {
                                    const days = Number(customDays)
                                    if (Number.isInteger(days) && days >= 1 && days <= 3650) void runOwnerAction(organization, 'extend', { days })
                                  }}
                                  disabled={!customDays || Number(customDays) < 1}
                                  className="inline-flex min-h-8 shrink-0 items-center rounded-md bg-[#e9b44c] px-2.5 text-xs font-bold text-[#0f1a17] transition hover:bg-[#f0c26a] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Add
                                </button>
                              </div>
                              <div className={`my-1.5 border-t ${T.border}`} />
                              {organization.status === 'banned' ? (
                                <button role="menuitem" onClick={() => void runOwnerAction(organization, 'unban')} className="flex min-h-9 w-full items-center gap-2.5 px-3 text-xs text-[#7fc9a6] transition-colors hover:bg-[#1d332b]">
                                  <ShieldX className="h-3.5 w-3.5" /> Unban (restore access)
                                </button>
                              ) : (
                                <button role="menuitem" onClick={() => setConfirmState({ kind: 'ban', organization })} className="flex min-h-9 w-full items-center gap-2.5 px-3 text-xs text-[#f0a08f] transition-colors hover:bg-[#1d332b]">
                                  <Ban className="h-3.5 w-3.5" /> Ban client…
                                </button>
                              )}
                              {organization.status === 'suspended' ? (
                                <button role="menuitem" onClick={() => void runOwnerAction(organization, 'reactivate')} className="flex min-h-9 w-full items-center gap-2.5 px-3 text-xs text-[#7fc9a6] transition-colors hover:bg-[#1d332b]">
                                  <Power className="h-3.5 w-3.5" /> Turn back on (+30d window)
                                </button>
                              ) : (
                                <button role="menuitem" onClick={() => void runOwnerAction(organization, 'suspend')} className="flex min-h-9 w-full items-center gap-2.5 px-3 text-xs text-[#f0a08f] transition-colors hover:bg-[#1d332b]">
                                  <PauseCircle className="h-3.5 w-3.5" /> Turn off (suspend)
                                </button>
                              )}
                              {organization.status === 'grace' && (
                                <button role="menuitem" onClick={() => void runOwnerAction(organization, 'reactivate')} className="flex min-h-9 w-full items-center gap-2.5 px-3 text-xs text-[#7fc9a6] transition-colors hover:bg-[#1d332b]">
                                  <Power className="h-3.5 w-3.5" /> Resume now (+30d window)
                                </button>
                              )}
                              {!isLegacy && (
                                <>
                                  <div className={`my-1.5 border-t ${T.border}`} />
                                  <button role="menuitem" onClick={() => { setConfirmState({ kind: 'purge', organization }); setConfirmSlug('') }} className="flex min-h-9 w-full items-center gap-2.5 px-3 text-xs font-semibold text-[#e2705f] transition-colors hover:bg-[#e2705f]/10">
                                    <Trash2 className="h-3.5 w-3.5" /> Delete all data…
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className={`p-8 text-sm ${T.muted}`}>
                {organizations.length === 0 ? 'No clients yet. Approve a trial request to create the first workspace.' : `No clients match the current filters.`}
              </p>
            )}
          </div>
        </section>

        <p className={`mt-8 text-center text-xs ${T.faint}`}>© {new Date().getFullYear()} Natural Intellects Ltd · NIWMS Control Center</p>
      </div>

      {/* Confirm dialogs: ban (with reason) and purge (type-to-confirm) */}
      {confirmState && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={confirmState.kind === 'ban' ? 'Confirm ban' : 'Confirm data deletion'}>
          <div className={`w-full max-w-md rounded-xl border ${T.surface} bg-[#12211d] p-6 shadow-2xl shadow-black/50`}>
            {confirmState.kind === 'ban' ? (
              <>
                <h3 className="flex items-center gap-2 text-lg font-semibold"><Ban className="h-5 w-5 text-[#e2705f]" /> Ban {confirmState.organization.name}?</h3>
                <p className={`mt-2 text-sm leading-6 ${T.muted}`}>Every member loses sign-in access immediately. Their data is kept. You can unban at any time to restore access.</p>
                <label className={`mt-4 block text-xs font-semibold uppercase tracking-widest ${T.faint}`} htmlFor="ban-reason">Reason (optional, kept in the audit log)</label>
                <input
                  id="ban-reason"
                  value={confirmReason}
                  onChange={(e) => setConfirmReason(e.target.value)}
                  maxLength={300}
                  placeholder="e.g. Non-payment dispute"
                  className="mt-2 h-10 w-full rounded-lg border border-[#3a5548] bg-[#0f1a17] px-3 text-sm text-[#f4f1e8] placeholder:text-[#5f7269] focus:border-[#e9b44c]/60 focus:outline-none"
                />
                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={() => { setConfirmState(null); setConfirmReason('') }} className="inline-flex min-h-10 items-center rounded-lg border border-[#3a5548] px-4 text-sm font-semibold text-[#a8b8b0] transition hover:bg-[#1d332b]">Cancel</button>
                  <button
                    onClick={() => void runOwnerAction(confirmState.organization, 'ban', { reason: confirmReason })}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#e2705f] px-4 text-sm font-bold text-[#0f1a17] transition hover:bg-[#e98a7c]"
                  >
                    <Ban className="h-4 w-4" /> Ban client
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="flex items-center gap-2 text-lg font-semibold"><Trash2 className="h-5 w-5 text-[#e2705f]" /> Delete all data for {confirmState.organization.name}?</h3>
                <p className={`mt-2 text-sm leading-6 ${T.muted}`}>This permanently deletes the workspace: members, employees, daily and monthly reports, notifications, and the organization itself. A tombstone audit record is kept. This cannot be undone.</p>
                <label className={`mt-4 block text-xs font-semibold uppercase tracking-widest ${T.faint}`} htmlFor="purge-confirm">Type the workspace slug “{confirmState.organization.slug}” to confirm</label>
                <input
                  id="purge-confirm"
                  value={confirmSlug}
                  onChange={(e) => setConfirmSlug(e.target.value)}
                  autoComplete="off"
                  className="mt-2 h-10 w-full rounded-lg border border-[#3a5548] bg-[#0f1a17] px-3 font-mono text-sm text-[#f4f1e8] focus:border-[#e2705f]/60 focus:outline-none"
                />
                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={() => { setConfirmState(null); setConfirmSlug('') }} className="inline-flex min-h-10 items-center rounded-lg border border-[#3a5548] px-4 text-sm font-semibold text-[#a8b8b0] transition hover:bg-[#1d332b]">Cancel</button>
                  <button
                    onClick={() => confirmSlug === confirmState.organization.slug && void runOwnerAction(confirmState.organization, 'purge')}
                    disabled={confirmSlug !== confirmState.organization.slug}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#e2705f] px-4 text-sm font-bold text-[#0f1a17] transition hover:bg-[#e98a7c] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> Delete forever
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
