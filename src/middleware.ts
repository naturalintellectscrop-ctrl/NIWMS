import { NextRequest, NextResponse } from 'next/server'

// Edge gate (Task 23 audit): pages under /app, /platform and /portal are
// client components that previously gated ONLY via client-side redirects, so
// an anonymous user pressing Back after logout could still render the app
// shell (APIs correctly 401'd — no data leak, but the bounce failed).
// This middleware performs a cookie-PRESENCE check and redirects to /login
// when absent. It is a UX/deep-link gate, NOT the access-control boundary:
// every API route still validates the JWT and enforces roles/tenancy
// server-side, and an invalid cookie still gets bounced by the client
// bootstrap when /api/auth/me returns 401.
const PROTECTED = /^\/(app|platform|portal)(\/|$)/

export function middleware(request: NextRequest) {
  if (!PROTECTED.test(request.nextUrl.pathname)) return NextResponse.next()
  if (request.cookies.has('ni_session')) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/app/:path*', '/platform/:path*', '/portal/:path*'],
}
