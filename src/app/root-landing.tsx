'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Mic,
  Play,
  Receipt,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react'
import { computeQuote, type BillingInterval, type Quote } from '@/lib/billing/pricing'

/* ------------------------------------------------------------------ */
/* Content — truthful NIWMS product messaging                          */
/* ------------------------------------------------------------------ */

const NAV_LINKS: Array<[string, string]> = [
  ['features', 'Features'],
  ['how-it-works', 'How It Works'],
  ['pricing', 'Pricing'],
  ['faq', 'FAQ'],
]

const FEATURES = [
  {
    icon: ClipboardCheck,
    title: 'Daily Employee Reporting',
    text: 'Employees submit structured daily work activities so managers can see what is actually being done.',
    card: 'bg-[#e9f0ee]',
    chip: 'bg-[#123c36]',
  },
  {
    icon: BarChart3,
    title: 'Workforce Visibility',
    text: 'Monitor submissions, missing reports, employees, departments and organizational activity.',
    card: 'bg-[#f5eadb]',
    chip: 'bg-[#c47b32]',
  },
  {
    icon: FileSpreadsheet,
    title: 'Monthly Reports',
    text: 'Turn daily activity into structured monthly reports with statistics, categories and achievements.',
    card: 'bg-[#e4ebe6]',
    chip: 'bg-[#356247]',
  },
  {
    icon: TrendingUp,
    title: 'Reporting Intelligence',
    text: 'Identify recurring work, dominant categories and evidence-based achievements from employee activity.',
    card: 'bg-[#f6ecdb]',
    chip: 'bg-[#b2761b]',
  },
]

const STEPS = [
  { number: '01', title: 'Create Your Workspace', text: 'Set up your organization and workforce.' },
  { number: '02', title: 'Add Your Team', text: 'Create departments, positions and employees.' },
  { number: '03', title: 'Capture Daily Work', text: 'Employees submit structured daily activity reports.' },
  { number: '04', title: 'Understand the Month', text: 'Generate monthly reports and workforce insights.' },
]

const FAQS: Array<[string, string]> = [
  ['Do employees need training?', 'The daily activity flow is intentionally simple. Most teams can introduce it with a short walkthrough and a clear reporting expectation.'],
  ['Can we export our monthly reports?', 'Yes. Monthly reporting is designed for structured, Excel-ready exports that include summaries, statistics, activities, and notes.'],
  ['How are employee reports generated?', 'Employees capture their daily activities as they happen. NIWMS then compiles those entries into monthly reports with statistics, work categories, and achievements ready for management.'],
  ['Is my organization\u2019s data isolated?', 'Yes. Data is scoped to your organization on the server, and access is role-aware. Important actions can be recorded in an audit trail for review.'],
  ['How does the trial work?', 'Start with a 14-day trial without payment details. You set up your workspace, add your team, and use the full reporting flow before deciding anything.'],
  ['What happens after the trial?', 'Choose the plan and billing interval that fit your organization. Because the trial requires no payment details, nothing is charged automatically.'],
]

/* ------------------------------------------------------------------ */
/* Pricing catalog — hydrates from the billing engine                  */
/* ------------------------------------------------------------------ */

interface PlanCard {
  key: string
  name: string
  description: string
  /** Whole UGX list price per month; null = custom-priced (Enterprise). */
  monthlyPrice: number | null
  maxEmployees: number | null
  limit: string
  featured?: boolean
}

// Fallback catalog — kept numerically identical to the Plan table (see
// ensureDefaultPlans in src/lib/entitlements.ts). The pricing section hydrates
// from GET /api/plans so the brochure and the billing engine can never drift.
const FALLBACK_PLANS: PlanCard[] = [
  { key: 'starter', name: 'Starter', description: 'A focused foundation for small teams.', monthlyPrice: 30000, maxEmployees: 10, limit: 'Up to 10 employees' },
  { key: 'business', name: 'Business', description: 'More visibility for growing organizations.', monthlyPrice: 75000, maxEmployees: 30, limit: 'Up to 30 employees', featured: true },
  { key: 'professional', name: 'Professional', description: 'Reporting depth for established teams.', monthlyPrice: 150000, maxEmployees: 75, limit: 'Up to 75 employees' },
  { key: 'enterprise', name: 'Enterprise', description: 'A plan shaped around your operating model.', monthlyPrice: null, maxEmployees: null, limit: '75+ employees' },
]

const INTERVALS: BillingInterval[] = ['monthly', 'quarterly', 'annual']

const ugx = (amount: number) => `UGX ${Math.round(amount).toLocaleString('en-US')}`

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function MarketingPage() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('annual')
  const [plans, setPlans] = useState<PlanCard[]>(FALLBACK_PLANS)
  const [activeSection, setActiveSection] = useState('features')
  const [ctaEmail, setCtaEmail] = useState('')

  // Hydrate the catalog from the billing engine's public endpoint. If it is
  // unreachable, the fallback constants above still render truthful numbers.
  useEffect(() => {
    let cancelled = false
    fetch('/api/plans')
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body?.plans) return
        const hydrated: PlanCard[] = body.plans.map((plan: { key: string; name: string; description?: string; monthlyPrice: number; maxEmployees: number | null; customPricing?: boolean }) => ({
          key: plan.key,
          name: plan.name,
          description: plan.description || FALLBACK_PLANS.find((fixture) => fixture.key === plan.key)?.description || '',
          monthlyPrice: plan.customPricing ? null : plan.monthlyPrice,
          maxEmployees: plan.maxEmployees,
          limit: plan.maxEmployees === null ? '75+ employees' : `Up to ${plan.maxEmployees} employees`,
          featured: FALLBACK_PLANS.find((fixture) => fixture.key === plan.key)?.featured,
        }))
        // Keep the brochure's display order (Starter → Enterprise) regardless
        // of how the catalog API sorts by price.
        hydrated.sort((a, b) => {
          const order = (plan: PlanCard) => FALLBACK_PLANS.findIndex((fixture) => fixture.key === plan.key)
          return order(a) - order(b)
        })
        if (hydrated.length > 0) setPlans(hydrated)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const sectionIds = NAV_LINKS.map(([id]) => id)
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActiveSection(visible.target.id)
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0.1, 0.4, 0.8] })
    sectionIds.forEach((id) => { const element = document.getElementById(id); if (element) observer.observe(element) })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>('.marketing-shell .reveal'))
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          revealObserver.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    revealItems.forEach((item) => revealObserver.observe(item))
    return () => revealObserver.disconnect()
  }, [])

  const onCtaSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = ctaEmail.trim()
    router.push(email ? `/start-free-trial?email=${encodeURIComponent(email)}` : '/start-free-trial')
  }

  return (
    <main className="marketing-shell min-h-screen bg-[#f4f6f8] text-[#17211b]">
      {/* ============================= NAV ============================= */}
      <header className="sticky top-0 z-30 border-b border-[#dce4e1] bg-[#f4f6f8]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="NIWMS by Natural Intellects — home">
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Natural%20Intellects%20LTD%20LOGO-kW8y0UnJCLLYKZinLc70NoJI9YPSup.png" alt="Natural Intellects Ltd" className="h-9 w-9 rounded-full object-cover" />
            <span className="text-lg font-bold tracking-tight text-[#123c36]">NIWMS</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#5b6865] lg:flex" aria-label="Primary navigation">
            {NAV_LINKS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className={`transition-colors hover:text-[#123c36] ${activeSection === id ? 'font-semibold text-[#123c36]' : ''}`}>{label}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-[#123c36] transition-colors hover:bg-[#e9f0ee]">Log In</Link>
            <Link href="/start-free-trial" className="rounded-lg bg-[#123c36] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-[#1d5249]">Start Free Trial</Link>
          </div>
          <button type="button" className="rounded-lg p-2 text-[#123c36] lg:hidden" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-[#dce4e1] bg-[#f4f6f8] px-5 py-4 lg:hidden" aria-label="Mobile navigation">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#3c4a46] hover:bg-[#e9f0ee]" onClick={() => setMenuOpen(false)}>{label}</a>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-[#dce4e1] pt-3">
              <Link href="/login" className="rounded-lg border border-[#d2ddda] bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#123c36]" onClick={() => setMenuOpen(false)}>Log In</Link>
              <Link href="/start-free-trial" className="rounded-lg bg-[#123c36] px-4 py-2.5 text-center text-sm font-semibold text-white" onClick={() => setMenuOpen(false)}>Start Free Trial</Link>
            </div>
          </nav>
        )}
      </header>

      {/* ============================= HERO ============================ */}
      <section className="hero-reveal relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-12 lg:grid-cols-[minmax(0,43fr)_minmax(0,57fr)] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-16">
        <div className="relative z-10">
          <Link href="#features" className="group mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce4e1] bg-white/80 py-1.5 pl-1.5 pr-3 text-xs font-medium text-[#4c5a56] shadow-sm transition-colors hover:border-[#c47b32]/40">
            <span className="rounded-full bg-[#123c36] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">New</span>
            Reporting intelligence is here
            <ChevronRight className="h-3.5 w-3.5 text-[#c47b32] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <h1 className="max-w-xl text-balance text-5xl font-bold leading-[1.05] tracking-[-0.035em] text-[#14201c] sm:text-6xl lg:text-[3.6rem]">
            Turn Daily Work
            <br />
            <span className="text-[#c47b32]">Into Clear<br />Workforce Insight.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#5b6865] sm:text-lg sm:leading-8">
            NIWMS gives organizations a structured way to capture daily employee activity, monitor reporting, and turn monthly work into clear management reports.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/start-free-trial" className="inline-flex items-center justify-center rounded-xl bg-[#123c36] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#123c36]/20 transition-all hover:-translate-y-0.5 hover:bg-[#1d5249]">
              Start Free Trial <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#dce4e1] bg-white px-6 py-3.5 text-sm font-semibold text-[#123c36] shadow-sm transition-colors hover:border-[#c47b32]/50 hover:bg-[#fbfcf8]">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#f5eadb]" aria-hidden="true">
                <Play className="h-3 w-3 fill-[#c47b32] text-[#c47b32]" />
              </span>
              See How It Works
            </a>
          </div>
          <p className="mt-8 flex items-center gap-2.5 text-xs font-medium text-[#738078]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#356247]" aria-hidden="true" />
            Built for organizations that need structured workforce reporting.
          </p>
        </div>
        <DashboardPreview />
      </section>

      {/* =========================== FEATURES ========================== */}
      <section id="features" className="scroll-mt-20 border-y border-[#dce4e1] bg-white px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">Features</p>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-[#14201c] sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">Everything you need to understand your workforce.</h2>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text, card, chip }) => (
              <article key={title} className={`reveal reveal-up flex flex-col rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_40px_-18px_rgba(18,60,54,0.28)] ${card}`}>
                <span className={`grid h-12 w-12 place-items-center rounded-xl shadow-sm ${chip}`} aria-hidden="true">
                  <Icon className="h-5.5 w-5.5 text-white" />
                </span>
                <h3 className="mt-7 text-center text-lg font-bold tracking-tight text-[#14201c]">{title}</h3>
                <p className="mt-3 text-center text-sm leading-6 text-[#5b6865]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ========================= HOW IT WORKS ======================== */}
      <section id="how-it-works" className="scroll-mt-20 px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,53fr)_minmax(0,47fr)] lg:gap-16">
          <HiwVisual />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">How It Works</p>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-[#14201c] sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">From daily activity to management insight.</h2>
            <div className="relative mt-10">
              <span aria-hidden="true" className="absolute bottom-6 left-[19px] top-6 w-px bg-[#dce4e1]" />
              {STEPS.map((step) => (
                <div key={step.number} className="relative flex gap-5 pb-9 last:pb-0">
                  <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dce4e1] bg-[#e9f0ee] text-sm font-bold text-[#b2761b]" aria-hidden="true">{step.number}</span>
                  <div className="pt-1">
                    <h3 className="text-base font-bold text-[#14201c]">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#5b6865]">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================ PRICING ========================== */}
      <section id="pricing" className="scroll-mt-20 border-y border-[#dce4e1] bg-white px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">Pricing</p>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-[#14201c] sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">Pricing that fits your organization.</h2>
            <p className="mt-4 text-sm leading-6 text-[#5b6865]">Every figure below is computed by the same billing engine that would invoice you — the amount, the VAT, the covered dates, and the renewal date are definitive, not estimates.</p>
          </div>
          <div className="mt-9 flex justify-center">
            <div className="flex items-center gap-1 rounded-xl border border-[#dce4e1] bg-[#f4f6f8] p-1 text-sm" role="group" aria-label="Billing interval">
              {INTERVALS.map((key) => {
                const reference = plans.find((plan) => plan.featured && plan.monthlyPrice) ?? plans.find((plan) => plan.monthlyPrice)
                const savePct = reference?.monthlyPrice
                  ? Math.round((1 - computeQuote({ monthlyPrice: reference.monthlyPrice, interval: key }).effectiveMonthlyPrice / reference.monthlyPrice) * 100)
                  : 0
                return (
                  <button key={key} type="button" aria-pressed={billingInterval === key} onClick={() => setBillingInterval(key)} className={`rounded-lg px-4 py-2 font-semibold transition-colors ${billingInterval === key ? 'bg-[#123c36] text-white shadow-sm' : 'text-[#5b6865] hover:text-[#123c36]'}`}>
                    {key === 'monthly' ? 'Monthly' : key === 'quarterly' ? 'Quarterly' : 'Annual'}
                    {savePct > 0 && <span className={`ml-1.5 text-xs font-bold ${billingInterval === key ? 'text-[#e9b44c]' : 'text-[#c47b32]'}`}>−{savePct}%</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-[#829086]">Prices exclude VAT · 18% added at billing</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const custom = plan.monthlyPrice === null
              const quote = custom ? null : computeQuote({ monthlyPrice: plan.monthlyPrice as number, interval: billingInterval })
              const savingsPct = quote && quote.monthlyEquivalentTotal > 0 ? Math.round((quote.savings / quote.monthlyEquivalentTotal) * 100) : 0
              return (
                <article key={plan.key} className={`reveal reveal-up relative flex flex-col rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(18,60,54,0.28)] ${plan.featured ? 'border-[#c47b32] bg-[#fbf4e4] shadow-[0_14px_36px_-18px_rgba(196,123,50,0.45)]' : 'border-[#dce4e1] bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-[#14201c]">{plan.name}</h3>
                    {plan.featured && <span className="rounded-full bg-[#c47b32] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Recommended</span>}
                  </div>
                  {custom ? (
                    <p className="mt-6 text-3xl font-bold tracking-tight text-[#14201c]">Custom<span className="text-sm font-medium text-[#829086]"> pricing</span></p>
                  ) : (
                    <>
                      <p className="mt-6 text-3xl font-bold tracking-tight text-[#14201c]">{ugx(quote!.effectiveMonthlyPrice)}<span className="text-sm font-medium text-[#829086]"> / month</span></p>
                      <p className="mt-1.5 text-xs leading-5 text-[#5b6865]">
                        Billed <span className="font-semibold text-[#304237]">{ugx(quote!.total)}</span> every {quote!.monthsCovered === 1 ? 'month' : `${quote!.monthsCovered} months`} · incl. VAT {ugx(quote!.vatAmount)}
                      </p>
                      {quote!.savings > 0 && (
                        <p className="mt-2.5 inline-flex w-fit items-center gap-1 rounded-full bg-[#e7f0e4] px-2.5 py-1 text-[11px] font-semibold text-[#356247]" aria-label={`Save ${ugx(quote!.savings)} compared to monthly billing`}>
                          <Check className="h-3 w-3" /> Save {ugx(quote!.savings)} ({savingsPct}%)
                        </p>
                      )}
                    </>
                  )}
                  <p className="mt-4 text-sm font-medium text-[#304237]">{plan.limit}</p>
                  <p className="mt-2 min-h-10 text-sm leading-6 text-[#5b6865]">{plan.description}</p>
                  <Link href={custom ? '/start-free-trial' : `/start-free-trial?plan=${plan.key}&interval=${billingInterval}`} className={`mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-px ${plan.featured ? 'bg-[#123c36] text-white hover:bg-[#1d5249]' : 'border border-[#d2ddda] bg-white text-[#123c36] hover:border-[#123c36]/40 hover:bg-[#f4f6f8]'}`}>
                    Get started <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                  </Link>
                </article>
              )
            })}
          </div>
          <PricingCalculator interval={billingInterval} plans={plans} />
        </div>
      </section>

      {/* ============================== FAQ ============================ */}
      <section id="faq" className="scroll-mt-20 px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">FAQ</p>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-[#14201c] sm:text-4xl">Questions, answered.</h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQS.map(([question, answer]) => (
              <details key={question} className="group rounded-xl border border-[#dce4e1] bg-white px-5 py-1 transition-colors open:bg-white hover:border-[#c47b32]/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[15px] font-semibold text-[#14201c] [&::-webkit-details-marker]:hidden">
                  {question}
                  <ChevronDown className="h-5 w-5 shrink-0 text-[#c47b32] transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="max-w-2xl pb-4 text-sm leading-6 text-[#5b6865]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* =========================== CTA BANNER ======================== */}
      <section className="px-5 pb-20 lg:px-8 lg:pb-24" aria-label="Get started with NIWMS">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#123c36] px-6 py-14 text-white sm:px-10 lg:px-14 lg:py-16">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[28px] border-white/[0.05]" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full border-[24px] border-[#c47b32]/15" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
            <div>
              <h2 className="text-3xl font-bold leading-[1.15] tracking-[-0.03em] sm:text-4xl">Make workforce reporting part of the workflow.</h2>
              <p className="mt-4 max-w-md text-[15px] leading-7 text-[#c4d0c5]">Start with a 14-day trial and see how NIWMS turns daily employee activity into management-ready insight.</p>
            </div>
            <div>
              <form onSubmit={onCtaSubmit} className="flex flex-col gap-3 sm:flex-row">
                <label htmlFor="cta-email" className="sr-only">Work email</label>
                <input
                  id="cta-email"
                  type="email"
                  required
                  value={ctaEmail}
                  onChange={(event) => setCtaEmail(event.target.value)}
                  placeholder="Enter your work email"
                  autoComplete="email"
                  className="w-full flex-1 rounded-xl border border-white/20 bg-white px-4 py-3.5 text-sm text-[#14201c] outline-none transition placeholder:text-[#829086] focus:border-[#e9b44c] focus:ring-2 focus:ring-[#e9b44c]/40"
                />
                <button type="submit" className="inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-[#c47b32] px-6 py-3.5 text-sm font-semibold text-white transition-all hover:-translate-y-px hover:bg-[#b2761b]">
                  Start Free Trial <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </button>
              </form>
              <p className="mt-3.5 flex items-center gap-1.5 text-xs text-[#9fb3ac]"><Check className="h-3.5 w-3.5 text-[#e9b44c]" aria-hidden="true" /> 14 days · Full features · No payment details required</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================= FOOTER ========================== */}
      <footer className="mt-auto border-t border-[#dce4e1] bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="Natural Intellects home">
              <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Natural%20Intellects%20LTD%20LOGO-kW8y0UnJCLLYKZinLc70NoJI9YPSup.png" alt="Natural Intellects Ltd" className="h-10 w-10 rounded-full object-cover" />
              <span className="text-base font-bold tracking-tight text-[#14201c]">Natural Intellects</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-[#5b6865]">NIWMS is the workforce reporting platform by Natural Intellects — built to turn daily employee activity into clear management insight.</p>
          </div>
          <nav aria-label="Product">
            <h3 className="text-sm font-bold text-[#14201c]">Product</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#5b6865]">
              <li><a href="#features" className="transition-colors hover:text-[#123c36]">Features</a></li>
              <li><a href="#how-it-works" className="transition-colors hover:text-[#123c36]">How It Works</a></li>
              <li><a href="#pricing" className="transition-colors hover:text-[#123c36]">Pricing</a></li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <h3 className="text-sm font-bold text-[#14201c]">Company</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#5b6865]">
              <li><Link href="/" className="transition-colors hover:text-[#123c36]">Natural Intellects</Link></li>
              <li><Link href="/start-free-trial" className="transition-colors hover:text-[#123c36]">Start Free Trial</Link></li>
              <li><a href="mailto:hello@naturalintellects.com" className="transition-colors hover:text-[#123c36]">Contact</a></li>
            </ul>
          </nav>
          <nav aria-label="Support">
            <h3 className="text-sm font-bold text-[#14201c]">Support</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#5b6865]">
              <li><a href="#faq" className="transition-colors hover:text-[#123c36]">FAQ</a></li>
              <li><a href="mailto:hello@naturalintellects.com" className="transition-colors hover:text-[#123c36]">Contact support</a></li>
              <li><Link href="/login" className="transition-colors hover:text-[#123c36]">Log In</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-[#e4eae8]">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-[#829086] sm:flex-row lg:px-8">
            <p>© {new Date().getFullYear()} Natural Intellects Ltd. All rights reserved.</p>
            <p>NIWMS — Workforce reporting by Natural Intellects</p>
          </div>
        </div>
      </footer>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* Hero product preview — a large NIWMS manager dashboard              */
/* ------------------------------------------------------------------ */

const SIDEBAR_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: UsersRound, label: 'Employees' },
  { icon: ClipboardCheck, label: 'Daily Reports' },
  { icon: FileSpreadsheet, label: 'Monthly Reports' },
  { icon: BellRing, label: 'Notifications', badge: '3' },
  { icon: Settings, label: 'Settings' },
]

const PREVIEW_STATS = [
  { label: 'Reports Today', value: '24', delta: '+3 vs yesterday', tone: 'text-[#356247]' },
  { label: 'Submitted', value: '21', delta: '87.5% of team', tone: 'text-[#356247]' },
  { label: 'Missing', value: '3', delta: 'Needs follow-up', tone: 'text-[#b2761b]' },
  { label: 'Active Employees', value: '24', delta: 'Across 4 departments', tone: 'text-[#5b6865]' },
]

const ACTIVITY_BARS = [
  { day: 'Mon', value: 18 },
  { day: 'Tue', value: 21 },
  { day: 'Wed', value: 19 },
  { day: 'Thu', value: 24, peak: true },
  { day: 'Fri', value: 22 },
  { day: 'Sat', value: 12 },
  { day: 'Sun', value: 9 },
]

const WORK_CATEGORIES = [
  { label: 'Field work', pct: 38, color: 'bg-[#123c36]' },
  { label: 'Client meetings', pct: 27, color: 'bg-[#38766b]' },
  { label: 'Administration', pct: 20, color: 'bg-[#c47b32]' },
  { label: 'Training', pct: 15, color: 'bg-[#cbd6cb]' },
]

const RECENT_REPORTS = [
  { initials: 'SK', name: 'Sarah K.', dept: 'Operations', status: 'Submitted', time: '9:41 AM', chip: 'bg-[#e7f0e4] text-[#356247]', avatar: 'bg-[#123c36]' },
  { initials: 'DM', name: 'David M.', dept: 'Finance', status: 'Submitted', time: '9:12 AM', chip: 'bg-[#e7f0e4] text-[#356247]', avatar: 'bg-[#356247]' },
  { initials: 'GA', name: 'Grace A.', dept: 'Programs', status: 'Missing', time: '—', chip: 'bg-[#f5eadb] text-[#8a5a13]', avatar: 'bg-[#c47b32]' },
  { initials: 'PO', name: 'Peter O.', dept: 'Logistics', status: 'Late', time: '8:04 AM', chip: 'bg-[#eef1f0] text-[#5b6865]', avatar: 'bg-[#7d958f]' },
]

function DashboardPreview() {
  return (
    <div className="hero-preview relative" data-testid="hero-dashboard">
      <div aria-hidden="true" className="absolute -inset-x-4 -top-6 bottom-2 rounded-[2.5rem] bg-gradient-to-br from-[#123c36]/10 via-transparent to-[#c47b32]/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-[#d5dfdb] bg-white shadow-[0_30px_80px_-24px_rgba(18,60,54,0.4)]">
        {/* App top bar */}
        <div className="flex items-center justify-between border-b border-[#e4eae8] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#123c36] text-xs font-bold text-white" aria-hidden="true">N</span>
            <span className="text-sm font-bold tracking-tight text-[#14201c]">NIWMS</span>
            <span className="ml-1 hidden rounded-md bg-[#f4f6f8] px-2 py-1 text-[10px] font-medium text-[#5b6865] sm:block">Acme Services</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-lg border border-[#e4eae8] bg-[#f8faf9] px-2.5 py-1.5 text-[10px] text-[#829086] sm:flex" aria-hidden="true">
              <Search className="h-3 w-3" /> Search reports…
            </span>
            <span className="relative text-[#5b6865]" aria-hidden="true">
              <BellRing className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#c47b32]" />
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e9f0ee] text-[10px] font-bold text-[#123c36]" aria-hidden="true">DN</span>
          </div>
        </div>
        <div className="grid grid-cols-[56px_1fr] sm:grid-cols-[168px_1fr]">
          {/* Sidebar */}
          <aside className="flex flex-col gap-1 bg-[#123c36] p-2.5 sm:p-3">
            {SIDEBAR_ITEMS.map(({ icon: Icon, label, active, badge }) => (
              <span key={label} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-[10.5px] font-medium sm:gap-2.5 sm:px-2.5 ${active ? 'bg-white/15 text-white' : 'text-[#b9cdc5]'}`} title={label}>
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden truncate sm:inline">{label}</span>
                {badge && <span className="ml-auto hidden rounded-full bg-[#c47b32] px-1.5 text-[9px] font-bold text-white sm:inline">{badge}</span>}
              </span>
            ))}
          </aside>
          {/* Main panel */}
          <div className="min-w-0 bg-[#f7f9f7] p-3.5 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#14201c] sm:text-lg">Good morning, Diana <span aria-hidden="true">👋</span></h2>
                <p className="mt-0.5 text-[11px] text-[#829086]">Here&apos;s how reporting looks across your organization today.</p>
              </div>
              <span className="rounded-full border border-[#e4eae8] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#5b6865]">Today · 9:52 AM</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              {PREVIEW_STATS.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-[#e4eae8] bg-white p-3">
                  <p className="text-[10px] font-medium text-[#829086]">{stat.label}</p>
                  <p className="mt-1 text-xl font-bold tracking-tight text-[#14201c] sm:text-2xl">{stat.value}</p>
                  <p className={`mt-0.5 text-[9.5px] font-medium ${stat.tone}`}>{stat.delta}</p>
                </div>
              ))}
            </div>
            <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[1.5fr_1fr]">
              {/* Reporting activity */}
              <div className="rounded-xl border border-[#e4eae8] bg-white p-3.5 sm:p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#14201c]">Reporting Activity</p>
                  <span className="text-[10px] font-medium text-[#829086]">Last 7 days</span>
                </div>
                <div className="mt-3 flex h-20 items-end gap-2 sm:h-24" aria-hidden="true">
                  {ACTIVITY_BARS.map((bar) => (
                    <span key={bar.day} className={`w-full flex-1 rounded-t-md opacity-90 ${bar.peak ? 'bg-[#c47b32]' : 'bg-[#123c36]'}`} style={{ height: `${(bar.value / 24) * 100}%` }} />
                  ))}
                </div>
                <div className="mt-1 flex gap-2 text-center text-[8.5px] font-medium text-[#829086]" aria-hidden="true">
                  {ACTIVITY_BARS.map((bar) => <span key={bar.day} className="flex-1">{bar.day}</span>)}
                </div>
                <div className="mt-3 border-t border-[#eef1f0] pt-3">
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full" aria-hidden="true">
                    {WORK_CATEGORIES.map((cat) => <span key={cat.label} className={cat.color} style={{ width: `${cat.pct}%` }} />)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-medium text-[#5b6865]">
                    {WORK_CATEGORIES.map((cat) => (
                      <span key={cat.label} className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${cat.color}`} aria-hidden="true" /> {cat.label} {cat.pct}%
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Recent reports */}
              <div className="rounded-xl border border-[#e4eae8] bg-white p-3.5 sm:p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#14201c]">Recent Reports</p>
                  <span className="text-[10px] font-semibold text-[#c47b32]">View all</span>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {RECENT_REPORTS.map((report) => (
                    <li key={report.name} className="flex items-center gap-2.5">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white ${report.avatar}`} aria-hidden="true">{report.initials}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-[#14201c]">{report.name}</span>
                        <span className="block text-[9.5px] text-[#829086]">{report.dept}</span>
                      </span>
                      <span className="text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${report.chip}`}>{report.status}</span>
                        <span className="mt-0.5 block text-[9px] text-[#829086]">{report.time}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Floating status chip — subtle controlled overlap */}
      <div className="float-chip absolute -bottom-5 left-6 flex items-center gap-2.5 rounded-xl border border-[#e4eae8] bg-white px-3.5 py-2.5 shadow-[0_16px_40px_-14px_rgba(18,60,54,0.35)] sm:left-9">
        <CheckCircle2 className="h-4.5 w-4.5 text-[#356247]" aria-hidden="true" />
        <span>
          <span className="block text-[11px] font-bold text-[#14201c]">Monthly report ready</span>
          <span className="block text-[9.5px] text-[#829086]">August · 24 employees · Excel export</span>
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* How-it-works visual — the daily capture flow with layered chips     */
/* ------------------------------------------------------------------ */

function HiwVisual() {
  return (
    <div className="hiw-visual relative">
      <div className="rounded-3xl border border-[#dce4e1] bg-gradient-to-br from-white via-white to-[#e9f0ee] p-5 pb-14 shadow-[0_20px_50px_-24px_rgba(18,60,54,0.25)] sm:p-7 sm:pb-16">
        <div className="flex items-center gap-2.5">
          <p className="text-sm font-bold text-[#14201c]">Daily Activity Report</p>
          <span className="rounded-full bg-[#f5eadb] px-2.5 py-1 text-[10px] font-bold text-[#8a5a13]">Draft</span>
        </div>
        <div className="mt-4 rounded-2xl border border-[#e4eae8] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#123c36] text-[10px] font-bold text-white" aria-hidden="true">SB</span>
            <span>
              <span className="block text-xs font-bold text-[#14201c]">Sarah B. · Operations</span>
              <span className="block text-[10px] text-[#829086]">Today · Auto-saves as she types</span>
            </span>
          </div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[#829086]">What did you accomplish today?</p>
          <p className="mt-2 rounded-xl border border-[#e4eae8] bg-[#f8faf9] p-3.5 text-[12px] leading-5 text-[#3c4a46]">
            Completed the quarterly stock reconciliation, flagged two variances for the finance team, and shared the summary sheet with department heads.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#e9f0ee] px-2.5 py-1 text-[10px] font-semibold text-[#356247]">Field work</span>
            <span className="rounded-full bg-[#f5eadb] px-2.5 py-1 text-[10px] font-semibold text-[#8a5a13]">Reporting</span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#eef1f0] pt-3.5">
            <span className="flex items-center gap-2 text-[10px] font-medium text-[#5b6865]">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#f5eadb]" aria-hidden="true"><Mic className="h-3 w-3 text-[#b2761b]" /></span>
              Voice note attached · 0:42
              <span className="flex items-end gap-0.5" aria-hidden="true">
                {[6, 10, 7, 12, 8, 11, 5, 9].map((height, index) => <span key={index} className="w-0.5 rounded-full bg-[#c47b32]/70" style={{ height: `${height}px` }} />)}
              </span>
            </span>
            <span className="rounded-lg bg-[#123c36] px-3.5 py-2 text-[11px] font-bold text-white">Submit report</span>
          </div>
        </div>
      </div>
      {/* Layered product chips — straddling the container edges over background, like the reference photo cards */}
      <div className="float-chip absolute -right-2 top-16 w-44 rounded-xl border border-[#e4eae8] bg-white p-3 shadow-[0_16px_40px_-14px_rgba(18,60,54,0.35)] sm:-right-5 sm:top-20">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f5eadb]" aria-hidden="true"><FileSpreadsheet className="h-3.5 w-3.5 text-[#b2761b]" /></span>
          <span className="text-[11px] font-bold text-[#14201c]">Monthly report</span>
        </div>
        <p className="mt-1.5 text-[10px] leading-4 text-[#5b6865]">August is compiled and ready to export.</p>
        <p className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#356247]"><Check className="h-3 w-3" aria-hidden="true" /> Ready</p>
      </div>
      <div className="float-chip absolute -bottom-4 left-8 w-40 rounded-xl border border-[#e4eae8] bg-white p-3 shadow-[0_16px_40px_-14px_rgba(18,60,54,0.35)] sm:left-16">
        <p className="text-[10px] font-medium text-[#829086]">Reporting health</p>
        <p className="mt-0.5 text-xl font-bold tracking-tight text-[#14201c]">92%</p>
        <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-[#356247]"><TrendingUp className="h-3 w-3" aria-hidden="true" /> On track this week</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Interactive quote calculator                                        */
/* ------------------------------------------------------------------ */

interface QuoteResponse {
  plan: { key: string; name: string; monthlyPrice: number; maxEmployees: number | null; customPricing: boolean }
  interval: BillingInterval
  seats: number | null
  fits: boolean
  quote: Quote
}

// Interactive quote calculator. The numbers it displays come from the server's
// /api/billing/quote endpoint — the exact totals, VAT, covered period, and
// renewal date a subscriber would actually be charged on that plan + interval.
function PricingCalculator({ interval, plans }: { interval: BillingInterval; plans: PlanCard[] }) {
  const [seats, setSeats] = useState(24)
  const [planKey, setPlanKey] = useState('business')
  const [result, setResult] = useState<QuoteResponse | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const pricedPlans = plans.filter((plan) => plan.monthlyPrice !== null)
  // Derived (not synced) selection: if the currently chosen plan cannot hold
  // the requested seats, the calculator automatically falls back to the
  // cheapest plan that can — no cascading setState effects required.
  const selectedPlan =
    pricedPlans.find((plan) => plan.key === planKey && plan.maxEmployees !== null && seats <= plan.maxEmployees) ??
    pricedPlans.find((plan) => plan.maxEmployees !== null && seats <= plan.maxEmployees) ??
    pricedPlans[pricedPlans.length - 1] ??
    pricedPlans[0]

  useEffect(() => {
    if (!selectedPlan || selectedPlan.monthlyPrice === null) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setRefreshing(true)
      fetch(`/api/billing/quote?plan=${selectedPlan.key}&interval=${interval}&seats=${seats}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => { if (body?.quote) setResult(body) })
        .catch(() => undefined)
        .finally(() => setRefreshing(false))
    }, 200)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [interval, seats, selectedPlan])

  const quote = result?.quote ?? null
  const trialHref = `/start-free-trial?plan=${selectedPlan?.key ?? 'business'}&interval=${interval}&seats=${seats}`

  return (
    <div className="reveal reveal-up mt-6 overflow-hidden rounded-2xl border border-[#dce4e1] bg-white shadow-[0_18px_44px_-24px_rgba(18,60,54,0.25)]" data-testid="pricing-calculator">
      <div className="grid gap-0 lg:grid-cols-[1fr_1.1fr]">
        <div className="border-b border-[#dce4e1] p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#c47b32]"><UsersRound className="h-4 w-4" /> Size your team</p>
          <h3 className="mt-3 text-2xl font-bold tracking-[-0.02em] text-[#14201c]">See your real number before you commit.</h3>
          <p className="mt-2 text-sm leading-6 text-[#5b6865]">Slide to your team size. The calculator picks the plan that fits and quotes the exact amount, dates, and renewal.</p>
          <div className="mt-7 flex items-end justify-between"><label htmlFor="seats" className="text-sm font-semibold text-[#304237]">Employees</label><span className="rounded-lg bg-[#e9f0ee] px-3 py-1 text-sm font-bold text-[#123c36]" aria-live="polite">{seats}</span></div>
          <input id="seats" type="range" min={1} max={100} step={1} value={seats} onChange={(event) => setSeats(Number(event.target.value))} className="mt-3 h-2 w-full cursor-pointer accent-[#c47b32]" aria-valuemin={1} aria-valuemax={100} aria-valuenow={seats} />
          <div className="mt-1 flex justify-between text-[11px] text-[#829086]"><span>1</span><span>25</span><span>50</span><span>75</span><span>100+</span></div>
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Plan">
            {pricedPlans.map((plan) => (
              <button key={plan.key} type="button" aria-pressed={selectedPlan?.key === plan.key} onClick={() => setPlanKey(plan.key)} className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${selectedPlan?.key === plan.key ? 'border-[#123c36] bg-[#123c36] text-white' : 'border-[#d2ddda] text-[#5b6865] hover:bg-[#e9f0ee]'}`}>
                {plan.name}
                {plan.maxEmployees !== null && <span className="ml-1 opacity-70">≤{plan.maxEmployees}</span>}
              </button>
            ))}
          </div>
          {seats > 75 && <p className="mt-3 rounded-lg bg-[#fbf0dc] px-3 py-2 text-xs font-medium text-[#8a5a13]" role="note">Above 75 employees our team tailors an Enterprise plan — the quote shows the Professional rate as a reference.</p>}
        </div>
        <div className="bg-[#f7f9f6] p-6 sm:p-8" aria-live="polite">
          <p className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#c47b32]"><span className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Your quote</span><span className={`flex items-center gap-1.5 text-[10px] font-semibold normal-case tracking-normal text-[#829086] ${refreshing ? 'opacity-100' : 'opacity-70'}`}>{refreshing && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#c47b32]" aria-hidden="true" />}{refreshing ? 'updating…' : 'server-verified'}</span></p>
          {quote ? (
            <>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-[#304237]">{result?.plan.name} · {quote.intervalLabel} billing · {seats} seat{seats === 1 ? '' : 's'}</p>
                <p className="text-3xl font-bold tracking-[-0.03em] text-[#14201c]">{ugx(quote.total)}</p>
              </div>
              <p className="mt-1 text-xs text-[#829086]">Due today, VAT inclusive</p>
              <dl className="mt-5 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-[#5b6865]">Effective monthly rate</dt><dd className="font-semibold text-[#304237]">{ugx(quote.effectiveMonthlyPrice)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#5b6865]">Subtotal ({quote.monthsCovered} {quote.monthsCovered === 1 ? 'month' : 'months'})</dt><dd className="text-[#304237]">{ugx(quote.subtotal)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#5b6865]">VAT ({Math.round(quote.vatRate * 100)}%)</dt><dd className="text-[#304237]">{ugx(quote.vatAmount)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-[#dce4e1] pt-2.5"><dt className="flex items-center gap-1.5 text-[#5b6865]"><CalendarRange className="h-4 w-4 text-[#c47b32]" /> Period covered</dt><dd className="text-right font-semibold text-[#304237]">{quote.periodStartLabel} → {quote.periodEndLabel}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#5b6865]">Renews on</dt><dd className="font-semibold text-[#304237]">{quote.periodEndLabel}</dd></div>
                {quote.savings > 0 && (
                  <div className="flex justify-between gap-4 rounded-lg bg-[#e7f0e4] px-3 py-2"><dt className="font-semibold text-[#356247]">You save vs monthly billing</dt><dd className="font-bold text-[#356247]">{ugx(quote.savings)} ({quote.savingsPercent}%)</dd></div>
                )}
              </dl>
              <Link href={trialHref} className="mt-6 flex items-center justify-center rounded-xl bg-[#123c36] px-5 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5" aria-label={`Start free trial on ${result?.plan.name}, billed ${quote.intervalLabel.toLowerCase()}`}>Start with {result?.plan.name} · {quote.intervalLabel} <ArrowRight className="ml-2 h-4 w-4" /></Link>
              <p className="mt-3 text-center text-[11px] text-[#829086]">No payment during the 14-day trial — your billing interval takes effect when you convert.</p>
            </>
          ) : (
            <div className="mt-6 space-y-3" aria-hidden="true"><div className="h-8 w-40 animate-pulse rounded-lg bg-[#e2e8e0]" /><div className="h-4 w-full animate-pulse rounded bg-[#e2e8e0]" /><div className="h-4 w-3/4 animate-pulse rounded bg-[#e2e8e0]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[#e2e8e0]" /><div className="h-12 w-full animate-pulse rounded-xl bg-[#e2e8e0]" /></div>
          )}
        </div>
      </div>
    </div>
  )
}
