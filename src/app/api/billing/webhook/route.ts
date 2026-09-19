import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function verifySignature(payload: string, signature: string | null) {
  const secret = process.env.BILLING_WEBHOOK_SECRET ?? process.env.JWT_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  const provided = signature.replace(/^sha256=/, '')
  return expected.length === provided.length && timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

export async function POST(request: Request) {
  const payload = await request.text()
  if (!verifySignature(payload, request.headers.get('x-billing-signature'))) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let event: { id?: string; type?: string; data?: Record<string, unknown> }
  try { event = JSON.parse(payload) } catch { return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }) }
  if (!event.id || !event.type) return NextResponse.json({ error: 'Webhook id and type are required' }, { status: 400 })

  const existing = await db.auditEvent.findFirst({ where: { action: 'BILLING_WEBHOOK_RECEIVED', entityId: event.id } })
  if (existing) return NextResponse.json({ received: true, duplicate: true })

  const data = event.data ?? {}
  const providerSubscriptionId = typeof data.subscriptionId === 'string' ? data.subscriptionId : null
  const status = typeof data.status === 'string' ? data.status : null
  const subscription = providerSubscriptionId ? await db.subscription.findFirst({ where: { providerSubscriptionId } }) : null
  const organizationId = subscription?.organizationId ?? (typeof data.organizationId === 'string' ? data.organizationId : null)
  if (!organizationId) return NextResponse.json({ received: true, ignored: true })

  await db.$transaction(async (tx) => {
    if (subscription && (status || data.currentPeriodEnd)) {
      await tx.subscription.update({ where: { id: subscription.id }, data: {
        ...(status ? { status } : {}),
        ...(typeof data.currentPeriodStart === 'string' ? { currentPeriodStart: new Date(data.currentPeriodStart) } : {}),
        ...(typeof data.currentPeriodEnd === 'string' ? { currentPeriodEnd: new Date(data.currentPeriodEnd) } : {}),
      } })
    }
    await tx.auditEvent.create({ data: { organizationId, action: 'BILLING_WEBHOOK_RECEIVED', entityType: 'BillingEvent', entityId: event.id, metadata: JSON.stringify({ type: event.type, providerSubscriptionId, status }) } })
  })

  return NextResponse.json({ received: true })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
