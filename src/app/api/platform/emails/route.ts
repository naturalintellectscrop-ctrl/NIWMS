import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/auth'

// GET /api/platform/emails — super_admin only.
// Latest email delivery records (outbox provider rows ARE the delivery;
// smtp provider rows record real send attempts, including failures).

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateRequest(request)
    if (!payload) return unauthorizedResponse()
    if (payload.role !== 'super_admin') return forbiddenResponse()

    const limitParam = Number(new URL(request.url).searchParams.get('limit') ?? 30)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 100) : 30

    const [emails, total, failedCount] = await Promise.all([
      db.emailMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          organizationId: true,
          toEmail: true,
          subject: true,
          body: true,
          html: true,
          category: true,
          status: true,
          provider: true,
          error: true,
          createdAt: true,
          sentAt: true,
        },
      }),
      db.emailMessage.count(),
      db.emailMessage.count({ where: { status: 'failed' } }),
    ])

    return NextResponse.json({ emails, total, failedCount })
  } catch (error) {
    console.error('Platform emails error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
