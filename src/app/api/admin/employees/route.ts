import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { canAddEmployee, getEmployeeLimit } from '@/lib/entitlements'

// Helper: authenticate admin
async function authenticateAdmin(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

// Official predefined positions
const POSITIONS = [
  'Chief Executive Officer',
  'Operations and Administrative Officer',
  'Accounting Officer',
  'IT Officer',
  'Membership Officer',
  'Driver',
  'Copyright Inspector',
  'Licensing Officer',
]

function toPositionCode(position: string) {
  return position.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// GET /api/admin/employees - List all employees of the organization.
// Employees live in the canonical reporting model (reporting employee +
// SaaS membership); the legacy User link is kept as a fallback so
// pre-existing organizations keep working unchanged.
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')?.trim().toLowerCase() || ''

    const canonicalRows = await db.reportingEmployee.findMany({
      where: { organizationId: context.organizationId, ...(status ? { status } : {}) },
      include: { membership: true, position: true, department: true, _count: { select: { dailyReports: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const canonicalUserIds = canonicalRows
      .map((row) => row.membership?.userId)
      .filter((id): id is string => Boolean(id))

    const canonicalUsers = canonicalUserIds.length
      ? await db.user.findMany({
          where: { id: { in: canonicalUserIds } },
          include: { profile: true, _count: { select: { reports: true } } },
        })
      : []
    const usersById = new Map(canonicalUsers.map((user) => [user.id, user]))

    // Legacy fallback: users attached through the legacy organization link
    // (or legacy OrganizationMember rows) that have no canonical employee row.
    const legacyUsers = await db.user.findMany({
      where: {
        OR: [
          { organizationId: context.organizationId },
          { memberships: { some: { organizationId: context.organizationId, status: 'active' } } },
        ],
        ...(status ? { status } : {}),
      },
      include: { profile: true, _count: { select: { reports: true } } },
    })
    const canonicalUserSet = new Set(canonicalUserIds)

    const employees = [
      ...canonicalRows
        .map((row) => {
          const user = row.membership?.userId ? usersById.get(row.membership.userId) : undefined
          const username = user?.username ?? row.displayName
          return {
            id: user?.id ?? row.membershipId,
            username,
            role: user?.role ?? 'employee',
            status: user?.status ?? row.status,
            createdAt: (user?.createdAt ?? row.createdAt).toISOString(),
            profile: {
              employeeId: row.employeeCode,
              position: row.position?.name ?? user?.profile?.position ?? null,
            },
            _count: { reports: row._count.dailyReports + (user?._count.reports ?? 0) },
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ...legacyUsers
        .filter((user) => !canonicalUserSet.has(user.id))
        .map((user) => ({
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
          profile: {
            employeeId: user.profile?.employeeId ?? null,
            position: user.profile?.position ?? null,
          },
          _count: { reports: user._count.reports },
        })),
    ]

    const filtered = search
      ? employees.filter((employee) =>
          [employee.username, employee.profile.employeeId ?? '', employee.profile.position ?? '']
            .some((value) => value.toLowerCase().includes(search))
        )
      : employees

    return NextResponse.json({ employees: filtered, positions: POSITIONS })
  } catch (error) {
    console.error('Get employees error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/employees - Create new employee
export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateAdmin(request)
    if (!payload) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { context, response } = await requireOrganizationAdmin(payload)
    if (!context) return response

    const body = await request.json()
    const { username, password, employeeId, position } = body

    const canAdd = await canAddEmployee(context.organizationId)
    if (!canAdd) {
      const limit = await getEmployeeLimit(context.organizationId)
      return NextResponse.json({ error: `Employee limit reached for this plan (${limit}). Upgrade your plan to add another employee.` }, { status: 409 })
    }

    // Validate required fields
    if (!username || !password || !employeeId || !position) {
      return NextResponse.json(
        { error: 'All fields are required: username, password, employeeId, position' },
        { status: 400 }
      )
    }

    // Validate position - must be one of the predefined official positions
    if (!POSITIONS.includes(position)) {
      return NextResponse.json(
        { error: `Invalid position. Must be one of: ${POSITIONS.join(', ')}` },
        { status: 400 }
      )
    }

    // Usernames are globally unique in the schema; check up front for a clean 409.
    const existingUser = await db.user.findUnique({ where: { username } })
    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      )
    }

    // Employee ID is unique within the organization (canonical constraint).
    const existingCanonicalCode = await db.reportingEmployee.findFirst({
      where: { organizationId: context.organizationId, employeeCode: employeeId },
    })
    const existingProfile = !existingCanonicalCode
      ? await db.employeeProfile.findFirst({ where: { employeeId, user: { organizationId: context.organizationId } } })
      : null
    if (existingCanonicalCode || existingProfile) {
      return NextResponse.json(
        { error: 'Employee ID already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create the account. Organization association is derived server-side from
    // the canonical membership, never from a client-controlled field. The
    // legacy User.organizationId link is reserved for legacy organizations and
    // must not receive SaaS organization ids (separate tables/FKs).
    const user = await db.user.create({
      data: {
        username,
        passwordHash,
        role: 'employee',
        status: 'active',
        profile: {
          create: {
            employeeId,
            position,
          },
        },
      },
      include: { profile: true },
    })

    const canonicalMembership = await db.saaSOrganizationMembership.create({
      data: {
        organizationId: context.organizationId,
        userId: user.id,
        role: 'member',
        status: 'active',
      },
    })
    const canonicalPosition = await db.reportingPosition.upsert({
      where: { organizationId_code: { organizationId: context.organizationId, code: toPositionCode(position) } },
      update: { name: position },
      create: { organizationId: context.organizationId, name: position, code: toPositionCode(position) },
    })
    const canonicalEmployee = await db.reportingEmployee.create({
      data: {
        organizationId: context.organizationId,
        membershipId: canonicalMembership.id,
        employeeCode: employeeId,
        displayName: username,
        positionId: canonicalPosition.id,
        status: 'active',
      },
      include: { position: true, membership: true },
    })

    await db.saaSAuditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: payload.userId,
        action: 'employee_created',
        resourceType: 'reporting_employee',
        resourceId: canonicalEmployee.id,
        metadata: { userId: user.id, username, employeeId, position },
      },
    })

    return NextResponse.json({ ...canonicalEmployee, user }, { status: 201 })
  } catch (error) {
    console.error('Create employee error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
