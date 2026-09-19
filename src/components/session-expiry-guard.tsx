'use client'

import { useEffect } from 'react'
import { installSessionExpiryGuard } from '@/lib/session-expiry'

/**
 * Mounts the global fetch interceptor that reacts to mid-session 401s
 * (revoked token version, server-side session end) by ending the client
 * session and redirecting to the login page with an explanatory notice.
 * Renders nothing.
 */
export function SessionExpiryGuard() {
  useEffect(() => {
    installSessionExpiryGuard()
  }, [])
  return null
}
