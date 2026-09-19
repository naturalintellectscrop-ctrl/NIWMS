import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/auth/forgot-password — public endpoint
// Employee submits a password reset request for the admin to review
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, message } = body

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    // Find the user by username
    const user = await db.user.findUnique({
      where: { username: username.trim() },
      select: { id: true, username: true, status: true },
    })

    if (!user || user.status === 'archived') {
      return NextResponse.json({ message: 'If an eligible account exists, a password reset request has been submitted.' })
    }

    // Check for existing pending request
    const existingRequest = await db.passwordResetRequest.findFirst({
      where: {
        userId: user.id,
        status: 'pending',
      },
    })

    if (existingRequest) {
      return NextResponse.json(
        { error: 'You already have a pending password reset request. Please wait for the admin to process it.' },
        { status: 409 }
      )
    }

    // Create the reset request
    const resetRequest = await db.passwordResetRequest.create({
      data: {
        userId: user.id,
        username: user.username,
        message: message?.trim() || null,
        status: 'pending',
      },
    })

    return NextResponse.json({
      message: 'Password reset request submitted successfully. The administrator will review your request and update your password.',
      requestId: resetRequest.id,
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
