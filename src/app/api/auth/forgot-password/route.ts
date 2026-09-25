import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limiter'

// POST /api/auth/forgot-password — public endpoint
// Employee submits a password reset request for the admin to review.
// Task 23 audit hardening: responses are UNIFORM (no 409 "already pending"
// account/pending-state oracle), the free-text message is bounded, and the
// route is rate-limited per IP (5/hour).
const UNIFORM_MESSAGE =
  'If an eligible account exists, a password reset request has been submitted or is already pending. The administrator will review it.'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = checkRateLimit(`forgot:${ip}`, 'forgot_password')
  if (!limit.allowed) {
    // Uniform body on 429 as well: does not reveal whether the account exists.
    return NextResponse.json({ message: UNIFORM_MESSAGE }, { status: 429 })
  }

  try {
    let body: { username?: unknown; message?: unknown }
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    const username = typeof body.username === 'string' ? body.username.trim() : ''

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { username },
      select: { id: true, username: true, status: true },
    })

    if (user && user.status !== 'archived') {
      const existingRequest = await db.passwordResetRequest.findFirst({
        where: { userId: user.id, status: 'pending' },
        select: { id: true },
      })
      if (!existingRequest) {
        const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : null
        await db.passwordResetRequest.create({
          data: {
            userId: user.id,
            username: user.username,
            message,
            status: 'pending',
          },
        })
      }
    }

    return NextResponse.json({ message: UNIFORM_MESSAGE })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
