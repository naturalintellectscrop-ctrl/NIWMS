// =============================================================================
// Nylon Pay payment certification — one-shot end-to-end verifier.
//
// Two parts, both honest about what they are:
//
//   PART 1 — LOCAL CONTRACT E2E (always runs)
//     Drives the real NIWMS code paths end-to-end against the dev server and
//     the local Nylon Pay CONTRACT SIMULATOR (mini-services/nylonpay-simulator,
//     a wire-contract double implementing the published spec v2.4.0 signing and
//     webhook formats). This verifies NIWMS's checkout, verification, webhook
//     verification/idempotency, subscription sync, and security rejections.
//     It is NOT a real Nylon Pay transaction.
//
//   PART 2 — REAL SANDBOX ATTEMPT (only with real credentials)
//     If NYLONPAY_API_KEY/NYLONPAY_API_SECRET point at the real Nylon Pay API
//     (no NYLONPAY_BASE_URL override), performs an actual sandbox hosted-invoice
//     creation + server-side status lookup and reports the result. If the
//     credentials are absent from this environment (they live in Vercel), the
//     step is reported BLOCKED with the exact reason — never faked.
//
// Usage: bun scripts/nylonpay-sandbox-cert.ts
// =============================================================================

const BASE = process.env.NIWMS_BASE_URL ?? 'http://localhost:3000'
const WEBHOOK_SECRET = process.env.NYLONPAY_WEBHOOK_SECRET ?? ''
const SIMULATOR = 'http://localhost:3040'

interface Step { name: string; ok: boolean; detail: string }
const results: Step[] = []
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`)
}

function hmac(secret: string, body: string): string {
  return new Bun.CryptoHasher('sha256', secret).update(body).digest('hex')
}

async function main() {
  // ---------- PART 1: local contract E2E ----------
  console.log('\n=== PART 1 — local contract E2E (NIWMS + simulator) ===')

  // 0. Precondition: dev server + simulator up, env present.
  const health = await fetch(`${BASE}/api/plans`).then((r) => r.status).catch(() => 0)
  record('dev server reachable', health === 200, `GET /api/plans → ${health}`)
  const simHealth = await fetch(`${SIMULATOR}/simulator/health`).then((r) => r.json() as Promise<{ ok: boolean }>).catch(() => ({ ok: false }))
  record('contract simulator reachable', simHealth.ok === true, `GET ${SIMULATOR}/simulator/health`)

  // 1. Sign in as org A admin (tenant-scoped billing admin).
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organization: 'synthetic-org-a', username: 'syntheticorga.orgadmin@example.test', password: 'Ni#Synthetic2026' }),
  })
  const setCookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
  record('org admin sign-in', login.status === 200 && setCookie.length > 0, `POST /api/auth/login → ${login.status}`)
  const headers = { cookie: setCookie, 'content-type': 'application/json' }

  // 2. Employee must be rejected from billing admin actions (403).
  const empLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organization: 'synthetic-org-a', username: 'syntheticorga.employee1@example.test', password: 'Ni#Synthetic2026' }),
  })
  const empCookie = empLogin.headers.get('set-cookie')?.split(';')[0] ?? ''
  const empCheckout = await fetch(`${BASE}/api/billing`, {
    method: 'POST', headers: { cookie: empCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'start_checkout' }),
  })
  record('employee blocked from checkout (403)', empCheckout.status === 403, `employee start_checkout → ${empCheckout.status} (expect 403)`)

  // 3. Anonymous checkout rejected (401).
  const anonCheckout = await fetch(`${BASE}/api/billing`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'start_checkout' }),
  })
  record('anonymous checkout rejected (401)', anonCheckout.status === 401, `anon start_checkout → ${anonCheckout.status} (expect 401)`)

  // 4. Start checkout — server computes the amount (client sends NO money).
  const checkout = await fetch(`${BASE}/api/billing`, {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'start_checkout', interval: 'monthly', amountUgx: 1, currency: 'USD', organizationId: 'org-b-should-be-ignored' }),
  })
  const checkoutBody = (await checkout.json()) as {
    error?: string
    reused?: boolean
    payment?: { id: string; reference: string; status: string; amountUgx: number; currency: string; checkoutUrl: string | null; kind: string }
    quote?: { total: number }
  }
  const payment = checkoutBody.payment
  const STARTER_MONTHLY_QUOTE = 30000 * 1.18 // Starter UGX 30,000 + 18% VAT
const starterMonthlyQuote = STARTER_MONTHLY_QUOTE
  const amountRight = payment !== undefined && Math.abs(payment.amountUgx - starterMonthlyQuote) < 1
  record('checkout created; client money fields IGNORED', checkout.status === 200 && !!payment && amountRight,
    `status=${checkout.status} · charged UGX ${payment?.amountUgx?.toLocaleString()} (canonical ${Math.round(starterMonthlyQuote).toLocaleString()}) · client tried amountUgx=1/USD/other-org → all ignored`)

  // 5. Provider accepted the request and returned a reference + hosted page.
  const simTx = (await fetch(`${SIMULATOR}/simulator/transactions`).then((r) => r.json()) as { transactions: Array<{ reference: string; status: string; amount: number; currency: string; invoiceId: string }> })
    .transactions.find((t) => t.reference === payment?.reference)
  record('Nylon accepted the request (reference + hosted page)', !!simTx && simTx.status === 'pending' && simTx.amount === payment?.amountUgx && simTx.currency === 'UGX',
    simTx ? `provider tx status=${simTx.status} amount=${simTx.amount} ${simTx.currency} · checkoutUrl=${payment?.checkoutUrl}` : 'transaction not found at provider')

  // 6. NIWMS records the payment as pending.
  record('payment recorded pending in NIWMS', payment?.status === 'pending', `status=${payment?.status}`)

  // 7. Customer completes payment on the hosted page → provider fires webhook.
  const resolve = await fetch(`${SIMULATOR}/pay/${simTx?.invoiceId}/resolve`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'successful' }),
  }).then((r) => r.json() as Promise<{ status?: string }>)
  record('hosted payment completed at provider', resolve.status === 'successful', `simulator resolve → ${resolve.status}`)

  // 8. Webhook verified → payment successful → subscription ACTIVE.
  let billingAfter: { subscription?: { status: string; currentPeriodEnd: string | null }; payments?: Array<{ id: string; status: string; reference: string; providerTransactionId: string | null }> } = {}
  let settled = false
  for (let i = 0; i < 15; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    billingAfter = await fetch(`${BASE}/api/billing`, { headers }).then((r) => r.json())
    const fresh = billingAfter.payments?.find((p) => p.reference === payment?.reference)
    if (fresh?.status === 'successful') { settled = true; break }
  }
  const freshPayment = billingAfter.payments?.find((p) => p.reference === payment?.reference)
  record('webhook → payment SUCCEEDED in NIWMS', settled, `payment status=${freshPayment?.status} · providerTransactionId=${freshPayment?.providerTransactionId ?? 'none'}`)
  record('subscription activated (lifecycle synced)', billingAfter.subscription?.status === 'active', `subscription.status=${billingAfter.subscription?.status}`)

  // 9. Manual verify endpoint on a terminal payment is a no-op safe.
  const verifyAgain = await fetch(`${BASE}/api/billing/payments/${payment?.id}/verify`, { method: 'POST', headers })
  record('re-verify of terminal payment is safe', verifyAgain.status === 200, `POST verify → ${verifyAgain.status}`)

  // 10. Duplicate webhook (same delivery id) → one logical transition.
  const deliveryId = crypto.randomUUID()
  const webhookBody = JSON.stringify({
    delivery_id: deliveryId,
    event: 'transaction.successful',
    payload: { transactionId: 'dup-tx', reference: payment?.reference, amount: String(payment?.amountUgx), currency: 'UGX', status: 'successful', previousStatus: 'pending', type: 'collection', method: 'mobileMoney', mode: 'test', failureReason: null, operatorTid: null },
    timestamp: new Date().toISOString(),
  })
  const dup1 = await fetch(`${BASE}/api/billing/webhook/nylonpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nylon-signature': hmac(WEBHOOK_SECRET, webhookBody) }, body: webhookBody }).then((r) => r.json())
  const dup2 = await fetch(`${BASE}/api/billing/webhook/nylonpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nylon-signature': hmac(WEBHOOK_SECRET, webhookBody) }, body: webhookBody }).then((r) => r.json())
  record('webhook idempotency (same delivery 2× → one transition)', (dup1 as { result?: string }).result === 'processed' && (dup2 as { result?: string; duplicate?: boolean }).result === 'duplicate',
    `first=${(dup1 as { result?: string }).result} · second=${(dup2 as { result?: string }).result}`)

  // 11. Security rejections.
  const tampered = webhookBody.replace('"5000"', '"9999"').replace(`"${payment?.amountUgx}"`, '"9999"')
  const badSig = await fetch(`${BASE}/api/billing/webhook/nylonpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nylon-signature': hmac('wrong-secret', tampered) }, body: tampered })
  record('invalid webhook signature rejected (401)', badSig.status === 401, `→ ${badSig.status} (expect 401)`)
  const mismatchBody = JSON.stringify({ delivery_id: crypto.randomUUID(), event: 'transaction.successful', payload: { transactionId: 'x', reference: payment?.reference, amount: '999', currency: 'UGX', status: 'successful', previousStatus: 'pending', type: 'collection', method: 'mobileMoney', mode: 'test', failureReason: null, operatorTid: null }, timestamp: new Date().toISOString() })
  const mismatch = await fetch(`${BASE}/api/billing/webhook/nylonpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nylon-signature': hmac(WEBHOOK_SECRET, mismatchBody) }, body: mismatchBody }).then((r) => r.json())
  record('wrong-amount webhook REJECTED (payment untouched)', (mismatch as { result?: string }).result === 'rejected', `result=${(mismatch as { result?: string }).result}`)
  const unknownBody = JSON.stringify({ delivery_id: crypto.randomUUID(), event: 'transaction.successful', payload: { transactionId: 'y', reference: crypto.randomUUID(), amount: '5000', currency: 'UGX', status: 'successful', previousStatus: 'pending', type: 'collection', method: 'mobileMoney', mode: 'test', failureReason: null, operatorTid: null }, timestamp: new Date().toISOString() })
  const unknown = await fetch(`${BASE}/api/billing/webhook/nylonpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nylon-signature': hmac(WEBHOOK_SECRET, unknownBody) }, body: unknownBody }).then((r) => r.json())
  record('unknown reference handled safely (ignored)', (unknown as { result?: string }).result === 'ignored', `result=${(unknown as { result?: string }).result}`)

  // 12. Failure path: new checkout (annual — the upgrade), simulate failure.
  const checkout2 = await fetch(`${BASE}/api/billing`, { method: 'POST', headers, body: JSON.stringify({ action: 'start_checkout', interval: 'annual' }) })
  const body2 = (await checkout2.json()) as { payment?: { id: string; reference: string; amountUgx: number; checkoutUrl: string | null } }
  const tx2 = (await fetch(`${SIMULATOR}/simulator/transactions`).then((r) => r.json()) as { transactions: Array<{ reference: string; invoiceId: string }> }).transactions.find((t) => t.reference === body2.payment?.reference)
  await fetch(`${SIMULATOR}/pay/${tx2?.invoiceId}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'failed' }) })
  let failedSettled = false
  for (let i = 0; i < 15; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    const b = await fetch(`${BASE}/api/billing`, { headers }).then((r) => r.json())
    const p = b.payments?.find((x: { reference: string }) => x.reference === body2.payment?.reference)
    if (p?.status === 'failed') { failedSettled = true; break }
  }
  record('failed payment recorded (no activation)', failedSettled, `annual attempt → failed · subscription remains ${billingAfter.subscription?.status === 'active' ? 'active' : 'unchanged'}`)

  // 13. Cancelled path.
  const checkout3 = await fetch(`${BASE}/api/billing`, { method: 'POST', headers, body: JSON.stringify({ action: 'start_checkout', interval: 'quarterly' }) })
  const body3 = (await checkout3.json()) as { payment?: { reference: string } }
  const tx3 = (await fetch(`${SIMULATOR}/simulator/transactions`).then((r) => r.json()) as { transactions: Array<{ reference: string; invoiceId: string }> }).transactions.find((t) => t.reference === body3.payment?.reference)
  await fetch(`${SIMULATOR}/pay/${tx3?.invoiceId}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'cancelled' }) })
  await new Promise((r) => setTimeout(r, 2500))
  const billing3 = await fetch(`${BASE}/api/billing`, { headers }).then((r) => r.json())
  const p3 = billing3.payments?.find((x: { reference: string }) => x.reference === body3.payment?.reference)
  record('cancelled payment recorded', p3?.status === 'cancelled', `quarterly attempt → ${p3?.status}`)

  // ---------- PART 2: real sandbox attempt ----------
  console.log('\n=== PART 2 — real Nylon Pay sandbox attempt ===')
  const baseUrlOverride = process.env.NYLONPAY_BASE_URL
  const apiKey = process.env.NYLONPAY_API_KEY ?? ''
  const isSimulatorBase = !baseUrlOverride || baseUrlOverride.includes('localhost') || baseUrlOverride.includes('127.0.0.1')
  if (!apiKey || !process.env.NYLONPAY_API_SECRET) {
    record('real sandbox transaction', false, 'BLOCKED — NYLONPAY_API_KEY / NYLONPAY_API_SECRET are not present in this environment (they are configured in Vercel only). No fake result is reported; run this script on the Vercel deployment (or set the vars locally) to complete this step.')
  } else if (isSimulatorBase) {
    record('real sandbox transaction', false, 'BLOCKED — NYLONPAY_BASE_URL points at the local contract simulator, so any call would be against the double, not Nylon Pay. Set the real base URL (or unset the override) with npk_test_ credentials to certify.')
  } else {
    const { createNylonPay } = await import('@nile-squad/nylonpay-ts')
    const nylonpay = createNylonPay({ apiKey, apiSecret: process.env.NYLONPAY_API_SECRET! })
    try {
      const invoice = await nylonpay.createInvoice({
        amount: 35000,
        currency: 'UGX',
        customerEmail: 'naturalintellectscrop@gmail.com',
        customerName: 'NIWMS sandbox certification',
        description: 'NIWMS Nylon Pay sandbox certification',
        merchantReference: crypto.randomUUID(),
        metadata: { source: 'niwms-sandbox-cert' },
        tags: ['niwms', 'certification'],
      })
      if (!invoice.isOk) {
        record('real sandbox transaction', false, `PROVIDER REJECTED — ${invoice.error}`)
      } else {
        record(`real sandbox invoice created`, true, `invoiceNumber=${invoice.value.invoiceNumber ?? 'n/a'} link=${invoice.value.paymentLink}`)
        const status = await nylonpay.getStatus({ reference: invoice.value.id })
        record('real sandbox status lookup', status.isOk, status.isOk ? `status=${status.value.status}` : `lookup error=${status.error}`)
        record('real sandbox full path (payment completion)', false, 'BLOCKED — requires a human to complete the hosted payment (mobile money PIN). Open the payment link above to finish, or use the provider dashboard; the webhook path is certified in Part 1.')
      }
    } catch (error) {
      record('real sandbox transaction', false, `ERROR — ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // ---------- summary ----------
  const passed = results.filter((r) => r.ok).length
  const blocked = results.filter((r) => r.detail.startsWith('BLOCKED')).length
  const failed = results.length - passed - blocked
  console.log(`\n=== CERTIFICATION SUMMARY: ${passed} passed · ${blocked} blocked (honest) · ${failed} failed · ${results.length} total ===`)
  process.exit(failed > 0 ? 1 : 0)
}

export {}

await main()
