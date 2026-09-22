// =============================================================================
// Server-side payment verification — the browser redirect is NEVER the
// authority for a payment's state. This endpoint asks Nylon Pay directly
// (getTransaction by reference) and reconciles the local payment record
// through the same audited state machine the webhook uses.
//
// Tenant-scoped: only an org admin of the payment's own organization may
// trigger verification, and the payment id is always resolved inside the
// caller's tenant context.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireOrganizationAdmin } from '@/lib/tenant'
import { PaymentServiceError, syncPaymentFromProvider, toPaymentView } from '@/lib/payments/service'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await authenticateRequest(_request)
  const { context, response } = await requireOrganizationAdmin(auth)
  if (!context) return response

  const payment = await db.saaSPayment.findFirst({
    where: { id, organizationId: context.organizationId },
    include: { plan: { select: { name: true } } },
  })
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  try {
    const synced = await syncPaymentFromProvider(payment, context.userId)
    const fresh = await db.saaSPayment.findUnique({ where: { id: synced.id }, include: { plan: { select: { name: true } } } })
    return NextResponse.json({ payment: toPaymentView(fresh ?? payment, (fresh ?? payment).plan.name) })
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Unable to verify the payment with Nylon Pay right now' }, { status: 502 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
