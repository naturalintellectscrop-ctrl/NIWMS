/**
 * Tiny session-expiry flag transport, kept import-free so both the auth store
 * and the fetch guard can use it without module cycles.
 */

const EXPIRED_FLAG = 'ni_session_expired'

export function markSessionExpiredFlag(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(EXPIRED_FLAG, String(Date.now()))
  } catch {
    // Storage unavailable (private mode) — the redirect still happens.
  }
}

/** Returns true once if the flag (or ?expired=1 query) is present, then clears it. */
export function consumeSessionExpiredFlag(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.sessionStorage.getItem(EXPIRED_FLAG)) {
      window.sessionStorage.removeItem(EXPIRED_FLAG)
      return true
    }
    // Also honour the query parameter (covers hard redirects that skip storage).
    return new URLSearchParams(window.location.search).get('expired') === '1'
  } catch {
    return false
  }
}
