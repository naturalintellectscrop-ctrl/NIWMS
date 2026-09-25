/**
 * In-memory rate limiter for API endpoints.
 * Prevents abuse of report generation, regeneration, and bulk operations.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

const LIMITS: Record<string, RateLimitConfig> = {
  employee_generate: { maxRequests: 5, windowMs: 60 * 60 * 1000 },   // 5 per hour
  admin_generate: { maxRequests: 20, windowMs: 60 * 60 * 1000 },     // 20 per hour
  admin_bulk: { maxRequests: 3, windowMs: 60 * 60 * 1000 },          // 3 per hour
  password_change: { maxRequests: 5, windowMs: 15 * 60 * 1000 },     // 5 per 15 min (brute-force guard on current-password check)
  login_attempt: { maxRequests: 5, windowMs: 15 * 60 * 1000 },       // 5 FAILED logins per username+IP per 15 min (brute-force guard)
  forgot_password: { maxRequests: 5, windowMs: 60 * 60 * 1000 },     // 5 password-reset requests per IP per hour (enumeration/abuse guard)
  billing_quote: { maxRequests: 60, windowMs: 15 * 60 * 1000 },      // 60 anonymous quote lookups per 15 min per IP bucket
  billing_checkout: { maxRequests: 10, windowMs: 15 * 60 * 1000 },   // 10 checkout initiations per admin per 15 min (money-touching endpoint)
}

export function checkRateLimit(
  identifier: string,
  type: keyof typeof LIMITS
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = LIMITS[type]
  const key = `${type}:${identifier}`
  const now = Date.now()

  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs }
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

/**
 * Check a limit WITHOUT recording a hit. Used by flows that must only count
 * failures (e.g. login: successful sign-ins must not consume quota).
 */
export function peekRateLimit(
  identifier: string,
  type: keyof typeof LIMITS
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = LIMITS[type]
  const key = `${type}:${identifier}`
  const now = Date.now()

  const entry = store.get(key)
  if (!entry || now > entry.resetAt) {
    return { allowed: true, remaining: config.maxRequests, resetAt: now + config.windowMs }
  }
  return {
    allowed: entry.count < config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt: entry.resetAt,
  }
}

export function getRateLimitErrorMessage(type: keyof typeof LIMITS): string {
  const config = LIMITS[type]
  const windowMinutes = Math.round(config.windowMs / (60 * 1000))
  return `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${windowMinutes} minutes. Please try again later.`
}
