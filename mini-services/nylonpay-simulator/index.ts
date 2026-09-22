// =============================================================================
// Nylon Pay contract simulator — LOCAL TESTING ONLY.
//
// A faithful wire-contract double of the Nylon Pay backend (Nile.js action
// routing, request signing, response signing, webhook signing) so the NIWMS
// checkout → hosted page → webhook → subscription flow can be exercised
// end-to-end in the sandbox WITHOUT real credentials.
//
// THIS IS NOT NYLON PAY. It implements the published wire contract from the
// official SDK spec (github.com/nile-squad/specs, v2.4.0) and the reference
// TypeScript SDK's signing code. Real sandbox certification still requires
// real npk_test_ credentials — see scripts/nylonpay-sandbox-cert.ts.
//
// Differences from the real backend (deliberate, documented):
//   - accepts test-mode keys for sdk-create-invoice (the real backend allows
//     invoices in live mode only)
//   - the hosted payment page has explicit Complete/Fail controls so both
//     paths are deterministic (the real page collects mobile money)
//
// Configuration (environment):
//   NYLONPAY_API_KEY        expected npk_* value presented by the SDK
//   NYLONPAY_API_SECRET     expected nps_* value used for request/response HMAC
//   NYLONPAY_WEBHOOK_SECRET webhook signing secret
//   NIWMS_WEBHOOK_URL       where signed webhooks are delivered
//                           (default http://localhost:3000/api/billing/webhook/nylonpay)
//   PORT                    fixed 3040 (do not use the PORT env var)
// =============================================================================

import { createHmac, randomUUID } from 'node:crypto'

const PORT = 3040
const API_KEY = process.env.NYLONPAY_API_KEY ?? 'npk_test_simulator_key'
const API_SECRET = process.env.NYLONPAY_API_SECRET ?? 'nps_test_simulator_secret'
const WEBHOOK_SECRET = process.env.NYLONPAY_WEBHOOK_SECRET ?? 'nps_test_simulator_secret'
const NIWMS_WEBHOOK_URL = process.env.NIWMS_WEBHOOK_URL ?? 'http://localhost:3000/api/billing/webhook/nylonpay'

interface Transaction {
  id: string
  reference: string
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'on_hold' | 'successful' | 'failed' | 'cancelled'
  type: 'collection'
  method: 'mobileMoney'
  description: string
  phone: string
  email: string | null
  failureReason: string | null
  failureCategory: string | null
  failureCode: string | null
  operatorTid: string | null
  metadata: Record<string, string>
  merchantReference: string | null
  invoiceId: string | null
  mode: 'test'
  createdAt: string
  updatedAt: string
}

interface Invoice {
  id: string
  invoiceNumber: string
  amount: number
  currency: string
  customerEmail: string
  customerName: string | null
  status: 'open' | 'paid' | 'failed'
  reference: string
  createdAt: string
}

const transactions = new Map<string, Transaction>()
const invoices = new Map<string, Invoice>()

// --- signing helpers (exact reference-SDK algorithms) -----------------------

function compareByCodePoint(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => compareByCodePoint(a, b))
        .map(([k, v]) => [k, sortValue(v)]),
    )
  }
  return value
}

const canonical = (payload: unknown) => JSON.stringify(sortValue(payload))
const hmac = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex')

// --- wire responses ----------------------------------------------------------

function ok(data: Record<string, unknown>, nonce: string): Response {
  const dataWithNonce = { ...data, _requestNonce: nonce }
  const signature = hmac(API_SECRET, canonical(dataWithNonce))
  return Response.json({ status: true, message: 'OK', data: { ...dataWithNonce, _responseSignature: signature } })
}

function fail(message: string, category: string): Response {
  return Response.json({ status: false, message: `${message} -- error-type: ${category}`, data: {} }, { status: 400 })
}

// --- request verification ----------------------------------------------------

function verifyRequest(request: Request, payload: Record<string, unknown>): string | null {
  const key = request.headers.get('x-nylon-key')
  const nonce = request.headers.get('x-nylon-nonce')
  const timestamp = request.headers.get('x-nylon-timestamp')
  const signature = request.headers.get('x-nylon-signature')
  if (!key || !nonce || !timestamp || !signature) return 'missing auth headers'
  if (key !== API_KEY) return 'unknown api key'
  // The transport fingerprint travels inside the signed payload (`_fingerprint`)
  // — read it from there, exactly as the spec's signing string defines it.
  const fingerprint = typeof payload._fingerprint === 'string' ? payload._fingerprint : 'unknown'
  const expected = hmac(API_SECRET, `${fingerprint}.${nonce}.${timestamp}.${canonical(payload)}`)
  if (expected !== signature) return 'invalid request signature'
  const age = Math.abs(Date.now() - Number(timestamp))
  if (!Number.isFinite(age) || age > 10 * 60 * 1000) return 'stale request timestamp'
  return null
}

// --- webhook delivery ---------------------------------------------------------

async function deliverWebhook(transaction: Transaction): Promise<void> {
  const event =
    transaction.status === 'successful' ? 'transaction.successful'
    : transaction.status === 'failed' ? 'transaction.failed'
    : transaction.status === 'cancelled' ? 'transaction.cancelled'
    : 'transaction.processing'
  const body = {
    delivery_id: randomUUID(),
    event,
    payload: {
      transactionId: transaction.id,
      reference: transaction.reference,
      amount: String(transaction.amount),
      currency: transaction.currency,
      status: transaction.status,
      previousStatus: 'pending',
      type: transaction.type,
      method: transaction.method,
      mode: transaction.mode,
      failureReason: transaction.failureReason,
      failureCategory: transaction.failureCategory,
      failureCode: transaction.failureCode,
      operatorTid: transaction.operatorTid,
    },
    timestamp: new Date().toISOString(),
  }
  const raw = JSON.stringify(body)
  try {
    const response = await fetch(NIWMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nylon-signature': hmac(WEBHOOK_SECRET, raw) },
      body: raw,
    })
    console.log(`[webhook] ${event} ref=${transaction.reference} → ${NIWMS_WEBHOOK_URL} status=${response.status}`)
  } catch (error) {
    console.error(`[webhook] delivery failed:`, error instanceof Error ? error.message : error)
  }
}

function findTransactionByReference(reference: string): Transaction | undefined {
  return transactions.get(reference)
}

// --- actions -------------------------------------------------------------------

function actionCreateInvoice(payload: Record<string, unknown>): { data?: Record<string, unknown>; error?: [string, string] } {
  const amount = payload.amount
  const currency = typeof payload.currency === 'string' ? payload.currency : 'UGX'
  const customerEmail = payload.customerEmail
  if (typeof amount !== 'number' || amount < 500) return { error: ['Amount must be at least 500', 'validation'] }
  if (typeof customerEmail !== 'string' || !customerEmail.includes('@')) return { error: ['customerEmail is required', 'validation'] }
  const merchantReference = typeof payload.merchantReference === 'string' && payload.merchantReference ? payload.merchantReference : randomUUID()
  const id = randomUUID()
  const invoice: Invoice = {
    id,
    invoiceNumber: `NYP-${Date.now().toString(36).toUpperCase()}`,
    amount,
    currency,
    customerEmail,
    customerName: typeof payload.customerName === 'string' ? payload.customerName : null,
    status: 'open',
    reference: merchantReference,
    createdAt: new Date().toISOString(),
  }
  invoices.set(id, invoice)
  const metadata = (payload.metadata ?? {}) as Record<string, string>
  const transaction: Transaction = {
    id: randomUUID(),
    reference: merchantReference,
    amount,
    currency,
    status: 'pending',
    type: 'collection',
    method: 'mobileMoney',
    description: typeof payload.description === 'string' ? payload.description : 'Invoice payment',
    phone: typeof payload.customerPhone === 'string' ? payload.customerPhone.replace(/\D/g, '') : '256000000000',
    email: customerEmail,
    failureReason: null,
    failureCategory: null,
    failureCode: null,
    operatorTid: null,
    metadata,
    merchantReference,
    invoiceId: id,
    mode: 'test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  transactions.set(transaction.reference, transaction)
  const paymentLink = `http://localhost:${PORT}/pay/${id}`
  return {
    data: {
      id,
      invoiceNumber: invoice.invoiceNumber,
      paymentLink,
      url: paymentLink,
      amount: String(amount),
      currency,
      status: 'open',
    },
  }
}

function transactionRecord(transaction: Transaction) {
  return {
    id: transaction.id,
    reference: transaction.reference,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    type: transaction.type,
    method: transaction.method,
    description: transaction.description,
    phone: transaction.phone,
    email: transaction.email,
    failureReason: transaction.failureReason,
    failureCategory: transaction.failureCategory,
    failureCode: transaction.failureCode,
    operatorTid: transaction.operatorTid,
    metadata: transaction.metadata,
    merchantReference: transaction.merchantReference,
    invoiceId: transaction.invoiceId,
    mode: transaction.mode,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  }
}

function actionGetStatus(payload: Record<string, unknown>): { data?: Record<string, unknown>; error?: [string, string] } {
  const reference = payload.reference
  if (typeof reference !== 'string' || !reference) return { error: ['reference is required', 'validation'] }
  const transaction = findTransactionByReference(reference)
  if (!transaction) return { error: ['Transaction not found', 'not_found'] }
  return {
    data: {
      reference: transaction.reference,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      id: transaction.id,
      operatorTid: transaction.operatorTid,
      failureReason: transaction.failureReason,
      failureCategory: transaction.failureCategory,
      failureCode: transaction.failureCode,
      updatedAt: transaction.updatedAt,
    },
  }
}

function actionGetTransaction(payload: Record<string, unknown>): { data?: Record<string, unknown>; error?: [string, string] } {
  const { id, reference } = payload as { id?: string; reference?: string }
  if (!id && !reference) return { error: ['id or reference is required', 'validation'] }
  const transaction = (id ? [...transactions.values()].find((t) => t.id === id) : undefined) ?? (reference ? findTransactionByReference(reference) : undefined)
  if (!transaction) return { error: ['Transaction not found', 'not_found'] }
  return { data: transactionRecord(transaction) }
}

function actionListTransactions(payload: Record<string, unknown>): { data?: Record<string, unknown>; error?: [string, string] } {
  const status = typeof payload.status === 'string' ? payload.status : null
  const limit = typeof payload.limit === 'number' ? Math.min(100, Math.max(1, payload.limit)) : 20
  const offset = typeof payload.offset === 'number' ? Math.max(0, payload.offset) : 0
  let list = [...transactions.values()]
  if (status) list = list.filter((t) => t.status === status)
  const total = list.length
  const page = list.slice(offset, offset + limit).map((t) => ({
    id: t.id, reference: t.reference, amount: t.amount, currency: t.currency, status: t.status,
    type: t.type, method: t.method, mode: t.mode, tags: ['niwms'], createdAt: t.createdAt, updatedAt: t.updatedAt,
  }))
  return { data: { transactions: page, count: total, limit, offset, tags: (payload.tags as string[] | undefined) ?? [] } }
}

// --- server ---------------------------------------------------------------------

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname === '/') {
      const envelope = (await request.json().catch(() => null)) as { intent?: string; service?: string; action?: string; payload?: Record<string, unknown> } | null
      if (!envelope || envelope.intent !== 'execute' || envelope.service !== 'sdk' || typeof envelope.action !== 'string') {
        return fail('Malformed request envelope', 'validation')
      }
      const payload = envelope.payload ?? {}
      const requestError = verifyRequest(request, payload)
      if (requestError) return fail(requestError, 'auth')
      const nonce = request.headers.get('x-nylon-nonce')!
      let result: { data?: Record<string, unknown>; error?: [string, string] }
      switch (envelope.action) {
        case 'sdk-create-invoice': result = actionCreateInvoice(payload); break
        case 'sdk-get-status': result = actionGetStatus(payload); break
        case 'sdk-get-transaction': result = actionGetTransaction(payload); break
        case 'sdk-list-transactions': result = actionListTransactions(payload); break
        default: return fail(`Unknown action: ${envelope.action}`, 'validation')
      }
      if (result.error) return fail(result.error[0], result.error[1])
      return ok(result.data!, nonce)
    }

    // Simulated hosted payment page (the real one collects mobile money).
    if (request.method === 'GET' && url.pathname.startsWith('/pay/')) {
      const invoiceId = url.pathname.slice('/pay/'.length)
      const invoice = invoices.get(invoiceId)
      if (!invoice) return new Response('Invoice not found', { status: 404 })
      const transaction = findTransactionByReference(invoice.reference)
      const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Nylon Pay (simulator) — ${invoice.invoiceNumber}</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#f4f6f8;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#fff;border-radius:16px;padding:32px;max-width:380px;box-shadow:0 10px 30px rgba(0,0,0,.08)}h1{color:#123c36;font-size:20px;margin:0 0 4px}p{color:#64716f;font-size:14px}.badge{display:inline-block;background:#fdf3e3;color:#b2761b;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:4px 10px;margin-bottom:12px}.amount{font-size:32px;font-weight:800;color:#123c36;margin:12px 0}button{display:block;width:100%;border:0;border-radius:999px;padding:12px;font-weight:700;font-size:14px;margin-top:10px;cursor:pointer}.pay{background:#123c36;color:#fff}.fail{background:#fff;color:#a52e27;border:1px solid #e5b5b3}.done{background:#e9f0ee;color:#356247;border-radius:12px;padding:14px;text-align:center;font-weight:600}</style></head>
<body><div class="card"><span class="badge">Simulator — not a real charge</span><h1>${invoice.customerName ?? 'NIWMS'}</h1><p>${invoice.invoiceNumber} · ${transaction?.description ?? ''}</p><div class="amount">${invoice.currency} ${invoice.amount.toLocaleString()}</div>
${transaction && transaction.status === 'pending' ? `<button class="pay" onclick="resolve('successful')">Complete payment (MTN MoMo sandbox)</button><button class="fail" onclick="resolve('failed')">Simulate failure</button>` : `<div class="done">Transaction ${transaction?.status ?? 'unknown'}</div>`}
</div><script>async function resolve(outcome){await fetch('/pay/${invoiceId}/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({outcome})});location.reload()}</script></body></html>`
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    if (request.method === 'POST' && url.pathname.match(/^\/pay\/[^/]+\/resolve$/)) {
      const invoiceId = url.pathname.split('/')[2]
      const invoice = invoices.get(invoiceId)
      if (!invoice) return Response.json({ error: 'not found' }, { status: 404 })
      const body = (await request.json().catch(() => ({}))) as { outcome?: string }
      const transaction = findTransactionByReference(invoice.reference)
      if (transaction && transaction.status === 'pending') {
        if (body.outcome === 'successful') {
          transaction.status = 'successful'
          transaction.operatorTid = `SIM${Date.now()}`
        } else if (body.outcome === 'failed') {
          transaction.status = 'failed'
          transaction.failureReason = 'Simulated customer failure'
          transaction.failureCategory = 'customer'
          transaction.failureCode = 'customer_timeout'
        } else if (body.outcome === 'cancelled') {
          transaction.status = 'cancelled'
        }
        transaction.updatedAt = new Date().toISOString()
        invoice.status = transaction.status === 'successful' ? 'paid' : 'failed'
        await deliverWebhook(transaction)
      }
      return Response.json({ ok: true, status: transaction?.status })
    }

    // QA introspection
    if (url.pathname === '/simulator/transactions') {
      return Response.json({ transactions: [...transactions.values()].map(transactionRecord), invoices: [...invoices.values()] })
    }
    if (url.pathname === '/simulator/health') {
      return Response.json({ ok: true, service: 'nylonpay-simulator', transactions: transactions.size, invoices: invoices.size })
    }

    return new Response('Not found', { status: 404 })
  },
})

console.log(`Nylon Pay contract simulator listening on http://localhost:${PORT} (webhooks → ${NIWMS_WEBHOOK_URL})`)
