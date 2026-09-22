// =============================================================================
// Nylon Pay provider boundary — the ONLY module that knows the provider SDK.
//
// Nylon Pay is the sole payment processor for NIWMS. This is a maintainability
// and testing boundary, NOT a multi-provider abstraction: there is exactly one
// provider here and no provider-switching surface.
//
// Everything below reads credentials from server-side environment variables
// and never exposes their values — only whether they are present.
//
// Required environment variables:
//   NYLONPAY_API_KEY        npk_test_… (sandbox) / npk_live_… (production)
//   NYLONPAY_API_SECRET     nps_test_… / nps_live_…
//   NYLONPAY_WEBHOOK_SECRET webhook signing secret — a credential SEPARATE from
//                           the API secret (spec: webhooks fail verification if
//                           signed with the api secret).
// Optional:
//   NYLONPAY_BASE_URL       override API base URL (SDK config option; used by
//                           the local contract simulator in sandbox testing).
// =============================================================================

import { createNylonPay, verifyWebhookSignature, type NylonPaySdk, type TransactionStatus } from '@nile-squad/nylonpay-ts'

export const NYLON_PAY_ENV_NAMES = {
  apiKey: 'NYLONPAY_API_KEY',
  apiSecret: 'NYLONPAY_API_SECRET',
  webhookSecret: 'NYLONPAY_WEBHOOK_SECRET',
  baseUrl: 'NYLONPAY_BASE_URL',
} as const

export interface NylonPayConfigStatus {
  configured: boolean
  /** 'test' | 'live' derived from the npk_test_/npk_live_ key prefix. */
  mode: 'test' | 'live' | null
  /** Names of missing environment variables (names only, never values). */
  missing: string[]
}

export function nylonPayConfigStatus(): NylonPayConfigStatus {
  const apiKey = process.env[NYLON_PAY_ENV_NAMES.apiKey]
  const apiSecret = process.env[NYLON_PAY_ENV_NAMES.apiSecret]
  const missing: string[] = []
  if (!apiKey) missing.push(NYLON_PAY_ENV_NAMES.apiKey)
  if (!apiSecret) missing.push(NYLON_PAY_ENV_NAMES.apiSecret)
  const mode = apiKey ? (apiKey.startsWith('npk_live_') ? 'live' : apiKey.startsWith('npk_test_') ? 'test' : null) : null
  return { configured: missing.length === 0 && mode !== null, mode, missing }
}

let cachedClient: NylonPaySdk | null = null
let cachedKey: string | null = null

/**
 * Server-side SDK singleton. The SDK itself caches per key+secret+url; this
 * wrapper avoids re-reading env on every call and keeps a single instance per
 * lambda/container. Throws a caller-friendly error listing the missing env
 * NAMES (never values) when configuration is absent.
 */
export function getNylonPay(): NylonPaySdk {
  const status = nylonPayConfigStatus()
  if (!status.configured) {
    throw new Error(`Nylon Pay is not configured. Missing environment variables: ${status.missing.join(', ')}`)
  }
  const apiKey = process.env[NYLON_PAY_ENV_NAMES.apiKey]!
  if (cachedClient && cachedKey === apiKey) return cachedClient
  cachedClient = createNylonPay({
    apiKey,
    apiSecret: process.env[NYLON_PAY_ENV_NAMES.apiSecret]!,
    ...(process.env[NYLON_PAY_ENV_NAMES.baseUrl] ? { baseUrl: process.env[NYLON_PAY_ENV_NAMES.baseUrl] } : {}),
  })
  cachedKey = apiKey
  return cachedClient
}

/**
 * Verify a Nylon Pay webhook against the RAW request body bytes. Freshness is
 * checked inside the SDK (body timestamp, 5-minute default window). Returns
 * false for ANY failure — never throws (spec guarantee).
 */
export function verifyNylonWebhook(rawBody: string | Uint8Array, signature: string | null): boolean {
  const secret = process.env[NYLON_PAY_ENV_NAMES.webhookSecret]
  if (!secret || !signature) return false
  return verifyWebhookSignature({ payload: rawBody, signature, secret })
}

/** Provider statuses per spec v2.4.0. */
export const PROVIDER_STATUSES: readonly TransactionStatus[] = ['pending', 'processing', 'on_hold', 'successful', 'failed', 'cancelled']

export function isTerminalProviderStatus(status: string): boolean {
  return status === 'successful' || status === 'failed' || status === 'cancelled'
}

/** Wire statuses map 1:1; anything unrecognized fails closed to 'pending'. */
export function normalizeProviderStatus(raw: unknown): TransactionStatus {
  return PROVIDER_STATUSES.includes(raw as TransactionStatus) ? (raw as TransactionStatus) : 'pending'
}
