import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

// Shared auth for /api/internal/* cron endpoints (Task 23 audit fix).
// Vercel cron invokes targets with GET and — when the CRON_SECRET environment
// variable is set — an `Authorization: Bearer $CRON_SECRET` header. These
// handlers therefore accept GET and POST, and compare the bearer in constant
// time. Accepted secrets, in order: BILLING_CRON_SECRET (legacy name),
// CRON_SECRET (Vercel standard), JWT_SECRET (deployment fallback so existing
// deployments keep working). With none configured the endpoints stay locked.
export function cronAuthorized(request: Request): boolean {
  const expected = process.env.BILLING_CRON_SECRET ?? process.env.CRON_SECRET ?? process.env.JWT_SECRET
  if (!expected) return false
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function cronUnauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
