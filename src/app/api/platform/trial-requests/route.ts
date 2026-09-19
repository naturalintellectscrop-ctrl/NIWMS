import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/auth'

// Platform control-plane listing of marketing trial requests.
// GET /api/platform/trial-requests — super_admin only.

export async function GET(request: NextRequest) {
  const payload = await authenticateRequest(request)
  if (!payload) return unauthorizedResponse()
  if (payload.role !== 'super_admin') {
    return forbiddenResponse('Natural Intellects platform administrator access required')
  }

  const [requests, pendingCount] = await Promise.all([
    db.trialRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    db.trialRequest.count({ where: { status: 'pending' } }),
  ])

  return NextResponse.json({ requests, pendingCount })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
