'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileSpreadsheet,
  Headphones,
  LockKeyhole,
  Menu,
  Mic,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'

const features = [
  { icon: ClipboardCheck, title: 'Daily work reporting', text: 'Give every employee a clear, low-friction place to capture meaningful work as it happens.' },
  { icon: BarChart3, title: 'Management visibility', text: 'See submission health, recurring work, and team activity without chasing spreadsheets.' },
  { icon: FileSpreadsheet, title: 'Monthly workbooks', text: 'Export structured reports with summaries, statistics, activities, and notes ready to share.' },
  { icon: BellRing, title: 'Automated reminders', text: 'Keep reporting consistent with organization-aware reminders that respect local working hours.' },
  { icon: ShieldCheck, title: 'Responsible access', text: 'Tenant-aware access, roles, and audit trails keep workforce data in the right hands.' },
  { icon: Mic, title: 'Voice-to-text input', text: 'Capture a thought quickly, review it, then submit it as a polished daily activity entry.' },
]

const demos = [
  { label: 'For employees', title: 'Make the daily note easy to finish.', text: 'A focused activity capture flow helps people record outcomes, blockers, and next steps before the day disappears.', items: ['Outcome-led prompts', 'Voice-to-text input', 'Draft before submit'] },
  { label: 'For managers', title: 'See where attention belongs.', text: 'A concise management view surfaces reporting health and patterns without turning work into noise.', items: ['Submission health', 'Team activity signals', 'Clear follow-up cues'] },
  { label: 'For leadership', title: 'Turn activity into operating context.', text: 'Monthly summaries give leaders a dependable view of what moved, what repeated, and what needs a decision.', items: ['Structured summaries', 'Excel-ready exports', 'Auditable activity'] },
]

const plans = [
  { name: 'Starter', monthly: 30000, limit: 'Up to 10 employees', description: 'A focused foundation for small teams.' },
  { name: 'Business', monthly: 75000, limit: 'Up to 30 employees', description: 'More visibility for growing organizations.', featured: true },
  { name: 'Professional', monthly: 150000, limit: 'Up to 75 employees', description: 'Reporting depth for established teams.' },
  { name: 'Enterprise', monthly: null, limit: '75+ employees', description: 'A plan shaped around your operating model.' },
]

const faqs = [
  ['Do employees need training?', 'The daily activity flow is intentionally simple. Most teams can introduce it with a short walkthrough and a clear reporting expectation.'],
  ['Can we export our monthly reports?', 'Yes. Monthly reporting is designed for structured, Excel-ready exports that include summaries, statistics, activities, and notes.'],
  ['How is access controlled?', 'Access is organization-scoped and role-aware. Important actions can be recorded in an audit trail for review.'],
  ['Can we start before choosing a paid plan?', 'Yes. Start with a 14-day trial without payment details, then choose the plan shape that fits your organization.'],
]

const formatPrice = (value: number | null, annual: boolean) => {
  if (value === null) return 'Custom'
  const amount = annual ? Math.round(value * 10 / 12) : value
  return `UGX ${amount.toLocaleString()}`
}

export default function MarketingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeDemo, setActiveDemo] = useState(0)
  const [annual, setAnnual] = useState(false)
  const [activeSection, setActiveSection] = useState('features')

  useEffect(() => {
    const sections = ['features', 'how-it-works', 'security', 'pricing']
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActiveSection(visible.target.id)
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0.1, 0.4, 0.8] })
    sections.forEach((id) => { const element = document.getElementById(id); if (element) observer.observe(element) })
    return () => observer.disconnect()
  }, [])

  return (
    <main className="marketing-shell min-h-screen overflow-hidden bg-[#f4f6f8] text-[#17211b]">
      <header className="sticky top-0 z-30 border-b border-[#dce4e1] bg-[#f4f6f8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/marketing" className="flex items-center gap-3" aria-label="Natural Intellects home">
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Natural%20Intellects%20LTD%20LOGO-kW8y0UnJCLLYKZinLc70NoJI9YPSup.png" alt="Natural Intellects Ltd" className="h-11 w-11 rounded-full object-cover" />
            <span className="hidden text-sm font-bold tracking-[0.1em] text-[#123c36] sm:block">NATURAL INTELLECTS</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-[#64716f] lg:flex" aria-label="Primary navigation">
            {[['features', 'Features'], ['how-it-works', 'How it works'], ['pricing', 'Pricing'], ['security', 'Security']].map(([id, label]) => <a key={id} href={`#${id}`} className={`border-b-2 py-2 transition-colors ${activeSection === id ? 'border-[#c47b32] text-[#123c36]' : 'border-transparent hover:text-[#123c36]'}`}>{label}</a>)}
          </nav>
          <div className="hidden items-center gap-3 lg:flex"><Link href="/login" className="rounded-full px-4 py-2.5 text-sm font-medium text-[#123c36] hover:bg-[#e9f0ee]">Log in</Link><Link href="/start-free-trial" className="rounded-full bg-[#123c36] px-5 py-2.5 text-sm font-semibold text-[#f4f6f8] shadow-sm transition-transform hover:-translate-y-0.5">Start free trial <ArrowRight className="ml-1 inline h-4 w-4" /></Link></div>
          <button type="button" className="rounded-lg p-2 lg:hidden" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
        {menuOpen && <nav className="flex flex-col gap-2 border-t border-[#dce4e1] px-5 py-4 text-sm lg:hidden" aria-label="Mobile navigation">{[['features', 'Features'], ['how-it-works', 'How it works'], ['pricing', 'Pricing'], ['security', 'Security']].map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-md px-2 py-3 focus:outline-none focus:ring-2 focus:ring-[#c47b32]" onClick={() => setMenuOpen(false)}>{label}</a>)}<Link href="/login" className="rounded-md px-2 py-3">Log in</Link><Link href="/start-free-trial" className="rounded-md px-2 py-3 font-semibold text-[#123c36]">Start free trial <ArrowRight className="ml-1 inline h-4 w-4" /></Link></nav>}
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.02fr_.98fr] lg:px-8 lg:pb-28 lg:pt-24">
        <div><p className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]"><span className="h-px w-8 bg-[#c47b32]" /> Workforce clarity, built in</p><h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-[#123c36] sm:text-6xl lg:text-7xl">Make every day of work <span className="text-[#c47b32]">visible.</span></h1><p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-[#64716f]">Natural Intellects turns daily employee activity into structured reports, management visibility, and actionable workforce insight.</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/start-free-trial" className="inline-flex items-center justify-center rounded-full bg-[#c47b32] px-6 py-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5">Start free trial <ArrowRight className="ml-2 h-4 w-4" /></Link><a href="#features" className="inline-flex items-center justify-center rounded-full border border-[#d2ddda] px-6 py-3.5 text-sm font-semibold text-[#123c36] hover:bg-[#e9f0ee]">Explore the platform</a></div><p className="mt-5 text-xs text-[#738078]">14-day trial · No payment required · Built for distributed teams</p></div>
        <div className="border border-[#cbd6cb] bg-[#123c36] p-4 shadow-2xl shadow-[#123c36]/15 sm:p-6"><div className="bg-[#f4f6f8] p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#829086]">Manager view</p><h2 className="mt-2 text-xl font-semibold text-[#123c36]">A practical view of reporting</h2></div><span className="border border-[#d2ddda] px-3 py-1 text-xs font-medium text-[#64716f]">Product preview</span></div><div className="mt-8 border-y border-[#dce4e1] py-8"><p className="text-sm font-semibold text-[#123c36]">Bring your organization&apos;s data into focus.</p><p className="mt-2 max-w-md text-sm leading-6 text-[#64716f]">Once connected, managers can see reporting health, recent activity, and monthly summaries in one place.</p><div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-[#356247]"><span className="bg-[#e9f0ee] px-3 py-2">Daily submissions</span><span className="bg-[#e9f0ee] px-3 py-2">Team activity</span><span className="bg-[#e9f0ee] px-3 py-2">Monthly insight</span></div></div><div className="mt-5 flex items-center gap-2 text-sm text-[#64716f]"><Check className="h-4 w-4 text-[#356247]" /> No sample metrics—your workspace stays grounded in your data.</div></div></div>
      </section>

      <section id="features" className="scroll-mt-24 border-y border-[#dce4e1] bg-[#e9f0ee] px-5 py-20 lg:px-8"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">A calmer operating rhythm</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#123c36] sm:text-5xl">The reporting system people can actually keep up with.</h2></div><div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[#d2ddd2] bg-[#d2ddd2] sm:grid-cols-2 lg:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="bg-[#e9f0ee] p-7 transition-colors hover:bg-[#f4f6f8]"><Icon className="h-5 w-5 text-[#c47b32]" /><h3 className="mt-8 text-lg font-semibold text-[#123c36]">{title}</h3><p className="mt-3 text-sm leading-6 text-[#64716f]">{text}</p></article>)}</div></div></section>

      <section id="how-it-works" className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28"><div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">One system, three useful views</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#123c36]">The right context for every role.</h2><p className="mt-5 leading-7 text-[#64716f]">Natural Intellects connects the daily note to the management decision without adding another maze of admin.</p><div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Product perspectives">{demos.map((demo, index) => <button key={demo.label} type="button" role="tab" aria-selected={activeDemo === index} onClick={() => setActiveDemo(index)} className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${activeDemo === index ? 'border-[#123c36] bg-[#123c36] text-[#f4f6f8]' : 'border-[#d2ddda] text-[#64716f] hover:bg-[#e9f0ee]'}`}>{demo.label}</button>)}</div></div><div role="tabpanel" className="rounded-2xl border border-[#dce4e1] bg-[#fbfcf8] p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c47b32]">{demos[activeDemo].label}</p><h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#123c36]">{demos[activeDemo].title}</h3><p className="mt-4 max-w-xl leading-7 text-[#64716f]">{demos[activeDemo].text}</p><ul className="mt-8 grid gap-3 sm:grid-cols-3">{demos[activeDemo].items.map((item) => <li key={item} className="rounded-xl bg-[#e9f0ee] p-4 text-sm font-semibold text-[#304237]"><Check className="mb-4 h-4 w-4 text-[#c47b32]" />{item}</li>)}</ul></div></div><div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{['Create your organization', 'Add employees and teams', 'Capture daily activity', 'Monitor reporting health', 'Generate monthly insight', 'Review, share, and export'].map((step, index) => <div key={step} className="flex items-center gap-4 rounded-xl border border-[#dce4e1] p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#123c36] text-sm font-semibold text-[#f4f6f8]">{index + 1}</span><span className="text-sm font-semibold text-[#304237]">{step}</span></div>)}</div></section>

      <section id="security" className="scroll-mt-24 bg-[#123c36] px-5 py-20 text-[#f4f6f8] lg:px-8 lg:py-24"><div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_1fr] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#e9b44c]">Built with care</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Your workforce data deserves a considered home.</h2><p className="mt-5 max-w-xl leading-7 text-[#c4d0c5]">Tenant-aware access, role-based permissions, secure authentication, and auditable activity are foundational—not add-ons.</p></div><div className="grid gap-3 sm:grid-cols-2">{[['Tenant isolation', 'Customer data is scoped server-side to its organization.'], ['Role-based access', 'Permissions follow responsibility, not guesswork.'], ['Audit logging', 'Important actions leave a clear, reviewable trail.'], ['Responsible exports', 'Reports respect ownership and organization boundaries.']].map(([title, text]) => <div key={title} className="rounded-xl border border-[#3d5c49] p-5"><ShieldCheck className="h-5 w-5 text-[#e9b44c]" /><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#b6c5b8]">{text}</p></div>)}</div></div></section>

      <section id="pricing" className="scroll-mt-24 mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">Simple starting points</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#123c36]">Choose the shape that fits your team.</h2></div><div className="flex items-center gap-3 rounded-full border border-[#dce4e1] bg-[#e9f0ee] p-1 text-sm"><button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)} className={`rounded-full px-4 py-2 font-semibold ${!annual ? 'bg-[#123c36] text-[#f4f6f8]' : 'text-[#64716f]'}`}>Monthly</button><button type="button" aria-pressed={annual} onClick={() => setAnnual(true)} className={`rounded-full px-4 py-2 font-semibold ${annual ? 'bg-[#123c36] text-[#f4f6f8]' : 'text-[#64716f]'}`}>Annual <span className="text-[#c47b32]">Save 2 mo</span></button></div></div><div className="mt-12 grid gap-4 lg:grid-cols-4">{plans.map((plan) => <article key={plan.name} className={`flex flex-col rounded-2xl border p-6 ${plan.featured ? 'border-[#c47b32] bg-[#fbf0dc]' : 'border-[#dce4e1] bg-[#f4f6f8]'}`}><div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-[#123c36]">{plan.name}</h3>{plan.featured && <span className="rounded-full bg-[#c47b32] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Popular</span>}</div><p className="mt-6 text-2xl font-semibold text-[#123c36]">{formatPrice(plan.monthly, annual)}<span className="text-sm font-normal text-[#829086]"> / month</span></p><p className="mt-2 text-sm text-[#64716f]">{plan.limit}</p><p className="mt-6 min-h-12 text-sm leading-6 text-[#64716f]">{plan.description}</p><Link href="/start-free-trial" className="mt-6 inline-flex items-center text-sm font-semibold text-[#123c36]">Get started <ArrowRight className="ml-2 h-4 w-4" /></Link></article>)}</div></section>

      <section className="mx-auto max-w-4xl px-5 pb-20 lg:px-8"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">Questions, answered</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#123c36]">A clearer start for your team.</h2><div className="mt-8 divide-y divide-[#dce4e1] border-y border-[#dce4e1]">{faqs.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-semibold text-[#304237] [&::-webkit-details-marker]:hidden">{question}<ChevronDown className="h-5 w-5 shrink-0 text-[#c47b32] transition-transform group-open:rotate-180" /></summary><p className="max-w-2xl pt-3 leading-7 text-[#64716f]">{answer}</p></details>)}</div></section>

      <section className="mx-5 mb-16 rounded-[2rem] bg-[#e9f0ee] px-6 py-14 text-center lg:mx-auto lg:max-w-7xl lg:px-8"><LockKeyhole className="mx-auto h-6 w-6 text-[#c47b32]" /><h2 className="mx-auto mt-5 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-[#123c36]">Give your people less admin and your leaders more signal.</h2><p className="mx-auto mt-4 max-w-xl leading-7 text-[#64716f]">Start with a 14-day trial and see how a clearer reporting rhythm changes the way your organization operates.</p><Link href="/start-free-trial" className="mt-8 inline-flex rounded-full bg-[#123c36] px-6 py-3.5 text-sm font-semibold text-[#f4f6f8]">Start free trial <ArrowRight className="ml-2 h-4 w-4" /></Link></section>

      <footer className="border-t border-[#dce4e1] px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-[#738078] sm:flex-row"><p>© {new Date().getFullYear()} Natural Intellects Ltd.</p><div className="flex flex-wrap gap-5"><a href="#security" className="hover:text-[#123c36]">Security</a><a href="#pricing" className="hover:text-[#123c36]">Pricing</a><a href="mailto:hello@naturalintellects.com" className="hover:text-[#123c36]">Contact</a><span className="flex items-center gap-1"><Headphones className="h-3.5 w-3.5" /> Support-ready</span></div></div></footer>
    </main>
  )
}
