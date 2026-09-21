// Seed demo clients for Control Center QA (local dev DB only).
// Run: bun scripts/qa-seed-clients.ts — idempotent, upserts by slug.

import { db } from '@/lib/db'

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()

const demo = [
  {
    name: 'Kampala Logistics Ltd',
    slug: 'kampala-logistics',
    status: 'active',
    trialEndsAt: new Date(now - 60 * DAY),
    sub: { status: 'active', billingInterval: 'monthly', currentPeriodStart: new Date(now - 10 * DAY), currentPeriodEnd: new Date(now + 20 * DAY) },
  },
  {
    name: 'Nile Agri Coop',
    slug: 'nile-agri-coop',
    status: 'trial',
    trialEndsAt: new Date(now + 9 * DAY),
    sub: { status: 'trialing', billingInterval: 'monthly', currentPeriodStart: null, currentPeriodEnd: null },
  },
  {
    name: 'Pearl Accounting Partners',
    slug: 'pearl-accounting',
    status: 'grace',
    trialEndsAt: new Date(now - 32 * DAY),
    graceEndsAt: new Date(now + 18 * DAY),
    sub: { status: 'expired', billingInterval: 'monthly', currentPeriodStart: new Date(now - 40 * DAY), currentPeriodEnd: new Date(now - 12 * DAY) },
  },
]

async function main() {
  const plan = await db.saaSPlan.findFirst({ where: { code: 'business' } })
  const starter = await db.saaSPlan.findFirst({ where: { code: 'starter' } })
  if (!plan || !starter) throw new Error('Plans not seeded')

  for (const entry of demo) {
    const organization = await db.saaSOrganization.upsert({
      where: { slug: entry.slug },
      update: { status: entry.status, trialEndsAt: entry.trialEndsAt, graceEndsAt: entry.graceEndsAt ?? null, bannedAt: null, bannedReason: null },
      create: { name: entry.name, slug: entry.slug, status: entry.status, trialEndsAt: entry.trialEndsAt, graceEndsAt: entry.graceEndsAt ?? null },
    })
    const existing = await db.saaSSubscription.findUnique({ where: { organizationId: organization.id } })
    const planId = entry.slug === 'kampala-logistics' ? plan.id : starter.id
    if (existing) {
      await db.saaSSubscription.update({
        where: { organizationId: organization.id },
        data: {
          planId,
          status: entry.sub.status,
          billingInterval: entry.sub.billingInterval,
          currentPeriodStart: entry.sub.currentPeriodStart,
          currentPeriodEnd: entry.sub.currentPeriodEnd,
        },
      })
    } else {
      await db.saaSSubscription.create({
        data: {
          organizationId: organization.id,
          planId,
          status: entry.sub.status,
          billingInterval: entry.sub.billingInterval,
          currentPeriodStart: entry.sub.currentPeriodStart,
          currentPeriodEnd: entry.sub.currentPeriodEnd,
        },
      })
    }
    console.log(`seeded ${entry.slug}: ${entry.status}`)
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error) => { console.error(error); process.exit(1) })
