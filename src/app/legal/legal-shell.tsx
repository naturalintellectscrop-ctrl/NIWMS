import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Shared shell for the /privacy and /terms legal pages.
 * Presentation mirrors the marketing system: off-white page, white prose card,
 * deep-green headings, amber eyebrows, restrained borders and radius.
 */

export function LegalShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string
  title: string
  intro: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6f8] text-[#17211b]">
      <header className="sticky top-0 z-30 border-b border-[#dce4e1] bg-[#f4f6f8]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="NIWMS by Natural Intellects — home">
            <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Natural%20Intellects%20LTD%20LOGO-kW8y0UnJCLLYKZinLc70NoJI9YPSup.png" alt="Natural Intellects Ltd" className="h-9 w-9 rounded-full object-cover" />
            <span className="text-lg font-bold tracking-tight text-[#123c36]">NIWMS</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-lg px-4 py-2 text-sm font-semibold text-[#123c36] transition-colors hover:bg-[#e9f0ee]">Back to home</Link>
            <Link href="/start-free-trial" className="rounded-lg bg-[#123c36] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-px hover:bg-[#1d5249]">Start Free Trial</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-14 lg:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c47b32]">{eyebrow}</p>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-[#14201c] sm:text-4xl">{title}</h1>
        <p className="mt-4 text-[15px] leading-7 text-[#5b6865]">{intro}</p>
        <p className="mt-2 text-xs font-medium text-[#829086]">Last updated: September 2026</p>

        <div className="mt-10 rounded-2xl border border-[#dce4e1] bg-white p-6 sm:p-10">
          <div className="space-y-9">{children}</div>
        </div>

        <p className="mt-8 text-sm leading-6 text-[#5b6865]">
          Questions about this document? Write to{' '}
          <a href="mailto:naturalintellectscrop@gmail.com" className="font-semibold text-[#123c36] underline decoration-[#c47b32]/50 underline-offset-4 hover:decoration-[#c47b32]">
            naturalintellectscrop@gmail.com
          </a>
          .
        </p>
      </main>

      <footer className="border-t border-[#dce4e1] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-[#829086] sm:flex-row lg:px-8">
          <p>© {new Date().getFullYear()} Natural Intellects Ltd. All rights reserved.</p>
          <nav aria-label="Legal" className="flex items-center gap-5">
            <Link href="/privacy" className="transition-colors hover:text-[#123c36]">Privacy Policy</Link>
            <Link href="/terms" className="transition-colors hover:text-[#123c36]">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight text-[#123c36]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-[#3c4a46]">{children}</div>
    </section>
  )
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={index} className="list-disc marker:text-[#c47b32]">{item}</li>
      ))}
    </ul>
  )
}
