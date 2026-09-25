// =============================================================================
// Nylon Pay payment integration — unit tests for the pure security/logic layer.
//
// DB-backed flows (checkout → webhook → subscription sync) are verified
// end-to-end by scripts/nylonpay-sandbox-cert.ts against the dev server and
// the local contract simulator; these tests pin the wire-contract math and
// the state mapping exactly as published in the Nylon Pay SDK spec v2.4.0.
// =============================================================================

import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { verifyWebhookSignature } from '@nile-squad/nylonpay-ts'
import { isTerminalProviderStatus, normalizeProviderStatus, nylonPayConfigStatus, NYLON_PAY_ENV_NAMES, verifyNylonWebhook } from '@/lib/payments/nylonpay'

const WEBHOOK_SECRET = 'nps_test_unit_webhook_secret'

beforeEach(() => {
  process.env[NYLON_PAY_ENV_NAMES.webhookSecret] = WEBHOOK_SECRET
})

afterEach(() => {
  delete process.env[NYLON_PAY_ENV_NAMES.apiKey]
  delete process.env[NYLON_PAY_ENV_NAMES.apiSecret]
})

// --- spec worked delivery (types.md "Worked Delivery") -----------------------

const SPEC_BODY = JSON.stringify({
  delivery_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  event: 'transaction.successful',
  payload: {
    transactionId: '3f9c1a7e-5b2d-48c6-a0e8-f4b1d7c92e50',
    reference: 'ORDER-2026-001',
    amount: '5000',
    currency: 'UGX',
    status: 'successful',
    previousStatus: 'pending',
    type: 'collection',
    method: 'mobileMoney',
    mode: 'live',
    failureReason: null,
    operatorTid: 'MP240611.0930.A12345',
  },
  timestamp: new Date().toISOString(),
})

function sign(body: string, secret = WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

describe('Nylon Pay webhook signature verification', () => {
  it('accepts a genuine signed delivery', () => {
    expect(verifyWebhookSignature({ payload: SPEC_BODY, signature: sign(SPEC_BODY), secret: WEBHOOK_SECRET })).toBe(true)
    expect(verifyNylonWebhook(SPEC_BODY, sign(SPEC_BODY))).toBe(true)
  })

  it('rejects a tampered payload (signature covers the exact raw bytes)', () => {
    const tampered = SPEC_BODY.replace('5000', '9999')
    expect(verifyNylonWebhook(tampered, sign(SPEC_BODY))).toBe(false)
  })

  it('rejects a wrong secret (api secret used as webhook secret fails closed)', () => {
    expect(verifyNylonWebhook(SPEC_BODY, sign(SPEC_BODY, 'nps_wrong_secret'))).toBe(false)
  })

  it('rejects missing signature or missing configured secret', () => {
    expect(verifyNylonWebhook(SPEC_BODY, null)).toBe(false)
    delete process.env[NYLON_PAY_ENV_NAMES.webhookSecret]
    expect(verifyNylonWebhook(SPEC_BODY, sign(SPEC_BODY))).toBe(false)
  })

  it('rejects stale signed bodies (replay protection via signed timestamp)', () => {
    const stale = JSON.stringify({
      delivery_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      event: 'transaction.successful',
      payload: { reference: 'ORDER-2026-001', status: 'successful' },
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    expect(verifyNylonWebhook(stale, sign(stale))).toBe(false)
  })

  it('never throws on malformed input (spec: verification fails closed)', () => {
    expect(verifyNylonWebhook('not json at all', sign('not json at all'))).toBe(false)
    expect(verifyNylonWebhook('', '')).toBe(false)
    expect(verifyNylonWebhook(SPEC_BODY, 'zz-not-hex')).toBe(false)
  })
})

describe('Nylon Pay configuration status', () => {
  it('reports missing variable NAMES without values', () => {
    const status = nylonPayConfigStatus()
    expect(status.configured).toBe(false)
    expect(status.missing).toEqual(['NYLONPAY_API_KEY', 'NYLONPAY_API_SECRET'])
  })

  it('derives mode from the npk_ prefix', () => {
    process.env[NYLON_PAY_ENV_NAMES.apiKey] = 'npk_test_abc'
    process.env[NYLON_PAY_ENV_NAMES.apiSecret] = 'nps_test_abc'
    expect(nylonPayConfigStatus()).toMatchObject({ configured: true, mode: 'test', missing: [] })
    process.env[NYLON_PAY_ENV_NAMES.apiKey] = 'npk_live_abc'
    expect(nylonPayConfigStatus()).toMatchObject({ configured: true, mode: 'live' })
    process.env[NYLON_PAY_ENV_NAMES.apiKey] = 'not-a-nylon-key'
    expect(nylonPayConfigStatus()).toMatchObject({ configured: false, mode: null })
  })
})

describe('Nylon Pay status mapping (spec v2.4.0 wire statuses)', () => {
  it('maps every published status 1:1', () => {
    expect(normalizeProviderStatus('pending')).toBe('pending')
    expect(normalizeProviderStatus('processing')).toBe('processing')
    expect(normalizeProviderStatus('on_hold')).toBe('on_hold')
    expect(normalizeProviderStatus('successful')).toBe('successful')
    expect(normalizeProviderStatus('failed')).toBe('failed')
    expect(normalizeProviderStatus('cancelled')).toBe('cancelled')
  })

  it('fails closed on unknown statuses', () => {
    expect(normalizeProviderStatus('SHIPPED')).toBe('pending')
    expect(normalizeProviderStatus(undefined)).toBe('pending')
    expect(normalizeProviderStatus(null)).toBe('pending')
    expect(normalizeProviderStatus({})).toBe('pending')
  })

  it('treats exactly the three spec terminal states as terminal', () => {
    expect(isTerminalProviderStatus('successful')).toBe(true)
    expect(isTerminalProviderStatus('failed')).toBe(true)
    expect(isTerminalProviderStatus('cancelled')).toBe(true)
    expect(isTerminalProviderStatus('pending')).toBe(false)
    expect(isTerminalProviderStatus('processing')).toBe(false)
    expect(isTerminalProviderStatus('on_hold')).toBe(false)
  })
})

describe('Nylon Pay webhook signature hygiene', () => {
  it('rejects a signature computed with the wrong secret (fail-closed contract)', () => {
    // Real contract check (replaces a former tautology that only asserted a
    // local literal): the SDK verifier must fail closed on secret mismatch —
    // the exact property the production webhook depends on.
    const body = JSON.stringify({ event: 'payment.succeeded', reference: 'r', amount: 35400, timestamp: new Date().toISOString() })
    const sign = (secret: string) => createHmac('sha256', secret).update(body).digest('hex')
    const good = sign('secret-a')
    expect(verifyWebhookSignature({ payload: body, signature: good, secret: 'secret-a' })).toBe(true)
    expect(verifyWebhookSignature({ payload: body, signature: good, secret: 'secret-b' })).toBe(false)
  })
})
