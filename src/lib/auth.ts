import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function getJwtSecret() {
  const configuredSecret = process.env.JWT_SECRET
  if (!configuredSecret) {
    throw new Error('JWT_SECRET must be configured before authentication is used')
  }
  return new TextEncoder().encode(configuredSecret)
}

export interface JWTPayload {
  userId: string
  username: string
  role: 'admin' | 'employee' | 'super_admin'
  organizationId?: string
  membershipId?: string
  organizationRole?: string
  tokenVersion?: number
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret())
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    const userId = payload.userId as string
    const claimedVersion = typeof payload.tokenVersion === 'number' ? payload.tokenVersion : 0

    // Session revocation: credential changes (password change, admin-set reset)
    // bump the user's tokenVersion, so tokens minted before the change carry a
    // stale version and stop resolving. One primary-key lookup per request.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    })
    if (!user || user.tokenVersion !== claimedVersion) return null

    return {
      userId,
      username: payload.username as string,
      role: payload.role as 'admin' | 'employee' | 'super_admin',
      organizationId: payload.organizationId as string | undefined,
      membershipId: payload.membershipId as string | undefined,
      organizationRole: payload.organizationRole as string | undefined,
      tokenVersion: claimedVersion,
    }
  } catch {
    return null
  }
}

export const SESSION_COOKIE = 'ni_session'

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7)
  return request.cookies.get(SESSION_COOKIE)?.value ?? null
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }
}

/**
 * Authenticate a request and return the JWT payload.
 * Returns null if unauthenticated or token invalid.
 */
export async function authenticateRequest(request: NextRequest): Promise<JWTPayload | null> {
  const token = getTokenFromRequest(request)
  if (!token) return null
  return verifyToken(token)
}

/**
 * Authenticate a request and verify the user is an admin.
 * Returns the admin payload or null.
 */
export async function authenticateAdmin(request: NextRequest): Promise<JWTPayload | null> {
  const payload = await authenticateRequest(request)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

/**
 * Helper: return a 401 Unauthorized response.
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

/**
 * Helper: return a 403 Forbidden response.
 */
export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 })
}
