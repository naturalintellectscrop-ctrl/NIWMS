import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { signToken, sessionCookie } from '@/lib/auth'
import { peekRateLimit, checkRateLimit } from '@/lib/rate-limiter'

// Brute-force guard: after 5 FAILED sign-ins for the same username within the
// window, further attempts are rejected until the window resets. Successful
// sign-ins never consume quota (peek before verify, record only failures).
function loginLocked(username: string) {
  return !peekRateLimit(username, 'login_attempt').allowed
}

function recordFailedLogin(username: string) {
  checkRateLimit(username, 'login_attempt')
}

// PostgreSQL supports SQL-side case-insensitive matching. The SQLite client
// used for local development does not, so fall back to a bounded lookup with
// application-side comparison there. Production behavior is unchanged.
const SUPPORTS_SQL_INSENSITIVE = !/^file:/.test(process.env.DATABASE_URL ?? '')

function nameMatchesOrganizationInput(name: string, input: string) {
  return name.trim().toLowerCase() === input.trim().toLowerCase()
}

async function findLegacyOrganization(input: string, requestedOrganizationId: string | undefined) {
  if (requestedOrganizationId) {
    return db.organization.findUnique({ where: { id: requestedOrganizationId } })
  }
  const bySlug = await db.organization.findUnique({ where: { slug: input.toLowerCase() } })
  if (bySlug) return bySlug
  if (SUPPORTS_SQL_INSENSITIVE) {
    // `mode` exists only on the PostgreSQL client; cast keeps the shared source compilable.
    const nameFilter = { equals: input, mode: 'insensitive' } as unknown as { equals: string }
    return db.organization.findFirst({ where: { name: nameFilter } })
  }
  const candidates = await db.organization.findMany({
    take: 200,
    select: { id: true, name: true, slug: true, status: true, organizationType: true },
  })
  return candidates.find((row) => nameMatchesOrganizationInput(row.name, input)) ?? null
}

async function findCanonicalOrganization(input: string, requestedOrganizationId: string | undefined) {
  if (requestedOrganizationId) {
    return db.saaSOrganization.findUnique({ where: { id: requestedOrganizationId } })
  }
  const bySlug = await db.saaSOrganization.findUnique({ where: { slug: input.toLowerCase() } })
  if (bySlug) return bySlug
  if (SUPPORTS_SQL_INSENSITIVE) {
    // `mode` exists only on the PostgreSQL client; cast keeps the shared source compilable.
    const nameFilter = { equals: input, mode: 'insensitive' } as unknown as { equals: string }
    return db.saaSOrganization.findFirst({ where: { name: nameFilter } })
  }
  const candidates = await db.saaSOrganization.findMany({ take: 200, select: { id: true, name: true, slug: true, status: true, organizationType: true } })
  return candidates.find((row) => nameMatchesOrganizationInput(row.name, input)) ?? null
}

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const organizationInput = typeof body.organization === 'string' ? body.organization.trim() : ''
    const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId : undefined

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    if (loginLocked(username)) {
      return NextResponse.json(
        { error: 'Too many failed sign-in attempts. Please try again in 15 minutes.' },
        { status: 429 }
      )
    }

    const user = await db.user.findUnique({
      where: { username },
      include: { profile: true, memberships: { where: { status: 'active' }, include: { organization: true } } },
    })

    if (!user || user.status !== 'active') {
      recordFailedLogin(username)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const isPlatformAdmin = user.role === 'super_admin'
    if (!isPlatformAdmin && !organizationInput && !requestedOrganizationId) {
      return NextResponse.json({ error: 'Organization, username, and password are required' }, { status: 400 })
    }

    const legacyOrganization = isPlatformAdmin
      ? null
      : await findLegacyOrganization(organizationInput, requestedOrganizationId)
    const canonicalOrganization = !isPlatformAdmin
      ? await findCanonicalOrganization(organizationInput, requestedOrganizationId)
      : null
    const canonicalMembership = canonicalOrganization
      ? await db.saaSOrganizationMembership.findFirst({
          where: { userId: user.id, organizationId: canonicalOrganization.id, status: 'active' },
        })
      : null
    const organization = canonicalOrganization ?? legacyOrganization

    if (!isPlatformAdmin && (!organization || !['active', 'trial', 'grace'].includes(organization.status))) {
      recordFailedLogin(username)
      return NextResponse.json({ error: 'Invalid organization credentials.' }, { status: 401 })
    }

    const membership = canonicalMembership ?? (legacyOrganization
      ? user.memberships.find((item) => item.organizationId === legacyOrganization.id)
      : undefined)
    const isLegacyOrganizationUser = Boolean(legacyOrganization && legacyOrganization.organizationType === 'LEGACY' && user.organizationId === legacyOrganization.id)
    if (!isPlatformAdmin && (!membership && !isLegacyOrganizationUser)) {
      recordFailedLogin(username)
      return NextResponse.json({ error: 'Invalid organization credentials.' }, { status: 401 })
    }


    const isValid = await verifyPassword(password, user.passwordHash)
    if (!isValid) {
      recordFailedLogin(username)
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role as 'admin' | 'employee' | 'super_admin',
      organizationId: membership?.organizationId ?? user.organizationId ?? undefined,
      membershipId: membership?.id,
      organizationRole: membership?.role,
      tokenVersion: user.tokenVersion,
    })

    // Audit failures must not turn a successful authentication into a 500 response.
    try {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'login',
          details: JSON.stringify({ organizationId: organization?.id ?? null }),
        },
      })
    } catch (auditError) {
      console.error('Login audit event failed:', auditError)
    }

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        organizationId: membership?.organizationId ?? organization?.id,
        organizationName: organization?.name ?? undefined,
        // 'LEGACY' organizations land in the portal experience; everything else in the workspace.
        organizationType: organization ? (organization.organizationType === 'LEGACY' ? 'LEGACY' : 'SAAS') : undefined,
        membershipId: membership?.id,
        organizationRole: membership?.role,
        organization: organization ? { id: organization.id, name: organization.name, slug: organization.slug } : null,
        profile: user.profile ? {
          employeeId: user.profile.employeeId,
          position: user.profile.position,
        } : null,
      },
    })
    response.cookies.set(sessionCookie(token))
    return response
  } catch (error) {
    console.error('Login error:', error)
    if (error instanceof Error && error.name === 'PrismaClientInitializationError') {
      return NextResponse.json(
        { error: 'Authentication service is not configured. Please contact support.' },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
