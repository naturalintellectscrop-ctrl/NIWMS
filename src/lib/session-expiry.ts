import { useAuthStore } from '@/store/auth-store'

/**
 * Global session-expiry handling.
 *
 * Server sessions can become invalid mid-session (password changed on another
 * device revokes old token versions, admin reset, server-side logout, etc.).
 * Individual views previously surfaced raw fetch errors or silently stale
 * data in that case. This guard watches every client fetch and, on the first
 * 401 from a non-auth API endpoint, cleanly ends the client session and
 * redirects to the login page with an explanatory notice.
 *
 * Auth endpoints are exempt: 401 from /api/auth/login means wrong
 * credentials, 401 from /api/auth/me is the normal "not signed in" probe, and
 * /api/auth/logout is a best-effort call that may already be invalid.
 */

const EXEMPT_API_PREFIXES = ['/api/auth/login', '/api/auth/me', '/api/auth/logout']

let handlingExpired = false

function requestPath(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === 'string') {
      const url = new URL(input, window.location.origin)
      return url.pathname
    }
    if (input instanceof URL) return input.pathname
    return new URL(input.url, window.location.origin).pathname
  } catch {
    return null
  }
}

/**
 * End the client session after the server rejected it, then route the user to
 * the login page with the "session expired" notice. Idempotent: parallel 401s
 * (a page typically fires several) trigger a single redirect.
 */
export function handleSessionExpired(): void {
  if (typeof window === 'undefined' || handlingExpired) return
  if (window.location.pathname.startsWith('/login')) return
  handlingExpired = true
  useAuthStore.getState().expireSession('expired')
}

/** Install a one-time fetch interceptor on the window (no-op on the server). */
export function installSessionExpiryGuard(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __niSessionExpiryGuardInstalled?: boolean }
  if (w.__niSessionExpiryGuardInstalled) return
  w.__niSessionExpiryGuardInstalled = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init)
    if (response.status === 401) {
      const path = requestPath(input)
      if (path?.startsWith('/api/') && !EXEMPT_API_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        handleSessionExpired()
      }
    }
    return response
  }) as typeof window.fetch
}
