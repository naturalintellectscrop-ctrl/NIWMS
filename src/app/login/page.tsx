'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Building2, Eye, EyeOff, Hourglass, Loader2, LockKeyhole, UserRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuthStore, type User } from '@/store/auth-store'
import { apiPost, ApiError } from '@/lib/api'
import { consumeSessionExpiredFlag } from '@/lib/session-flag'
import { AuthVisualPanel, logoUrl } from '@/components/auth-visual-panel'

interface OrganizationOption { id: string; name: string; slug: string }

export default function CommercialLoginPage() {
  const router = useRouter()
  const login = useAuthStore((state) => state.login)
  const [organization, setOrganization] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationOption[]>([])
  const [sessionEnded, setSessionEnded] = useState(false)

  // Show the "why am I back here" notice when a session was ended by
  // inactivity, a password change on another device, or a server-side
  // revocation — then clear the flag so refreshes don't repeat it.
  useEffect(() => {
    if (consumeSessionExpiredFlag()) setSessionEnded(true)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      const data = await apiPost<{ token: string; user: User }>('/api/auth/login', { organization, username, password })
      login(data.token, data.user)
      // LEGACY-type organizations (e.g. the UFMI federation) live in the portal
      // experience; platform staff go to the Control Center; everyone else to the workspace.
      const destination = data.user.role === 'super_admin'
        ? '/platform'
        : data.user.organizationType === 'LEGACY'
          ? '/portal'
          : '/app'
      router.replace(destination)
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        const body = requestError.data as { organizations?: OrganizationOption[] } | undefined
        setOrganizationOptions(body?.organizations ?? []); setError(requestError.message)
      } else setError('Unable to sign in right now. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <main className="flex min-h-screen bg-[#f4f1e8] text-[#161a18]">
      <AuthVisualPanel />
      <section className="flex min-h-screen w-full flex-col justify-center px-5 py-8 sm:px-10 lg:w-[48%] lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><img src={logoUrl} alt="Natural Intellects Ltd" className="h-10 w-10 rounded-full object-cover" /><div><p className="font-serif text-lg leading-none">Natural Intellects</p><p className="mt-1 text-[9px] uppercase tracking-[0.22em] text-[#69706a]">Employee systems</p></div></div>
          <div className="mb-8"><div className="mb-5 flex h-11 w-11 items-center justify-center bg-[#161a18] text-[#f4f1e8]"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#a66a16]">Secure workspace access</p><h2 className="mt-3 font-serif text-4xl leading-tight">Sign in to your organization.</h2><p className="mt-3 text-sm leading-6 text-[#69706a]">Use your organization identifier and existing account credentials.</p></div>
          {sessionEnded && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              role="status"
              aria-live="polite"
              className="mb-6 flex gap-3 border border-[#c47b32]/40 bg-[#c47b32]/10 p-4"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#c47b32]/15">
                <Hourglass className="h-4 w-4 text-[#a66a16]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#7a4d10]">Your session has ended</p>
                <p className="mt-1 text-xs leading-5 text-[#a66a16]">
                  For your security, sessions end after 20 minutes of inactivity or a password change. Sign in again to continue.
                </p>
              </div>
            </motion.div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div role="alert" className="flex gap-3 border border-[#ef4b3f]/30 bg-[#ef4b3f]/10 p-3 text-sm text-[#a52e27]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><div><p>{error}</p>{organizationOptions.length > 0 && <p className="mt-1 text-xs">Choose an organization below, then sign in again.</p>}</div></div>}
            <label className="block text-sm font-medium" htmlFor="organization">Organization / Company<div className="relative mt-2"><Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#69706a]" aria-hidden="true" /><input id="organization" value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Company name or organization code" className="h-12 w-full border border-[#c9c7bc] bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#161a18]" /></div><p className="mt-1.5 text-xs leading-5 text-[#69706a]">Platform administrators may leave this blank.</p></label>
            {organizationOptions.length > 0 && <div className="space-y-2"><p className="text-xs font-medium uppercase tracking-[0.14em] text-[#69706a]">Select your organization</p>{organizationOptions.map((option) => <button type="button" key={option.id} onClick={() => { setOrganization(option.slug); setOrganizationOptions([]); setError('') }} className="flex min-h-11 w-full items-center justify-between border border-[#c9c7bc] bg-white px-3 text-left text-sm hover:border-[#161a18]"><span>{option.name}</span><span className="font-mono text-xs text-[#69706a]">{option.slug}</span></button>)}</div>}
            <label className="block text-sm font-medium" htmlFor="username">Email or ID number<div className="relative mt-2"><UserRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#69706a]" aria-hidden="true" /><input id="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="you@company.com or your staff ID" required className="h-12 w-full border border-[#c9c7bc] bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#161a18]" /></div></label>
            <label className="block text-sm font-medium" htmlFor="password">Password<div className="relative mt-2"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="h-12 w-full border border-[#c9c7bc] bg-white px-3 pr-11 text-sm outline-none transition focus:border-[#161a18]" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-3 text-[#69706a] hover:text-[#161a18]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
            <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 bg-[#161a18] text-sm font-semibold text-[#f4f1e8] transition hover:bg-[#2b332e] disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <>Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}</button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-[#69706a]">Need access or forgot your password? Contact your organization administrator.</p>
        </div>
      </section>
    </main>
  )
}
