// =============================================================================
// Nylon Pay webhook receiver — the provider-authoritative payment event path.
//
// Contract (Nylon Pay SDK spec v2.4.0):
//   - POST with JSON body { delivery_id, event, payload: {…transaction…}, timestamp }
//   - `x-nylon-signature` = lowercase-hex HMAC-SHA256 over the RAW body bytes,
//     keyed with the merchant WEBHOOK SECRET (separate credential from the API
//     secret)
//   - replay protection via the signed body timestamp (5-minute window)
//   - at-least-once delivery → merchants MUST be idempotent (we dedupe on
//     delivery_id at the DATABASE level)
//   - respond 2xx within 10 seconds
//
// The raw body is read verbatim — never parsed-then-reserialized — because the
// signature covers the exact bytes on the wire.
// =============================================================================

import { NextResponse } from 'next/server'
import { verifyNylonWebhook } from '@/lib/payments/nylonpay'
import { processNylonWebhookDelivery, type NylonWebhookBody } from '@/lib/payments/service'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-nylon-signature')

  if (!verifyNylonWebhook(rawBody, signature)) {
    // Rejected before parsing: could be forged, stale, or misconfigured secret.
    // 401 makes the provider retry schedule give up after its attempts; the
    // rejection is visible to the operator via provider dashboards only — we
    // deliberately do not audit unverified payloads (they are attacker-controlled
    // data; logging their content would pollute the audit trail).
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let body: NylonWebhookBody
  try {
    body = JSON.parse(rawBody) as NylonWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const outcome = await processNylonWebhookDelivery(body)
  // processed / duplicate / ignored / rejected are all HANDLED deliveries —
  // ack with 200 so the provider stops retrying; rejected+ignored carry the
  // reason in the response body and in the org audit log.
  return NextResponse.json({ received: true, ...outcome })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
