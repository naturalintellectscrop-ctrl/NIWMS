// =============================================================================
// Provision the Natural Intellects platform owner (super_admin) account.
//
// The /platform Control Center is gated on role === 'super_admin'. This script
// creates (or promotes) exactly one such account in the TARGET database.
//
// Usage — never commit credentials:
//   OWNER_DATABASE_URL="postgresql://..." [NI_OWNER_USERNAME=...] [NI_OWNER_PASSWORD=...] \
//     bun scripts/provision-platform-owner.ts
//
// - OWNER_DATABASE_URL: the database to provision (Supabase pooler URL for
//   production, or the local SQLite file URL for development testing).
// - NI_OWNER_USERNAME: login username. Defaults to naturalintellectscrop@gmail.com.
// - NI_OWNER_PASSWORD: optional. When omitted, a strong random password is
//   generated and printed ONCE. When the user already exists and no password
//   is supplied, the existing password is left untouched (role-only promotion).
//
// Set a password (explicitly or generated) to rotate credentials: it rehashes
// with bcrypt-12 and bumps tokenVersion so earlier sessions are revoked.
// =============================================================================

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'

const url = process.env.OWNER_DATABASE_URL
if (!url) {
  console.error('OWNER_DATABASE_URL is required (never hardcode credentials).')
  process.exit(1)
}

const username = (process.env.NI_OWNER_USERNAME ?? 'naturalintellectscrop@gmail.com').trim().toLowerCase()
const explicitPassword = process.env.NI_OWNER_PASSWORD

// Unambiguous alphabet — no 0/O/1/l/I — grouped in fours for readability.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
function generatePassword(): string {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)]
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, pick).join('')).join('-')
}

const db = new PrismaClient({
  datasources: { db: { url } },
  log: ['error'],
})

async function main() {
  const generated = !explicitPassword
  const password = explicitPassword ?? generatePassword()
  if (password.length < 12) {
    console.error('NI_OWNER_PASSWORD must be at least 12 characters.')
    process.exit(1)
  }
  const passwordHash = await bcrypt.hash(password, 12)

  const existing = await db.user.findUnique({ where: { username }, select: { id: true, role: true, status: true } })

  const user = await db.user.upsert({
    where: { username },
    update: {
      role: 'super_admin',
      status: 'active',
      passwordHash,
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
    },
    create: {
      username,
      passwordHash,
      role: 'super_admin',
      status: 'active',
      mustChangePassword: false,
    },
    select: { id: true, username: true, role: true, status: true, tokenVersion: true },
  })

  const superAdmins = await db.user.count({ where: { role: 'super_admin' } })
  console.log(`✓ platform owner account ready — username: ${user.username} (role: ${user.role}, status: ${user.status}, tokenVersion: ${user.tokenVersion})`)
  console.log(`✓ super_admin accounts in database: ${superAdmins}`)
  if (generated) {
    console.log('┌──────────────────────────────────────────────┐')
    console.log(`│ password (shown once): ${password}`)
    console.log('└──────────────────────────────────────────────┘')
    console.log('Store it in a password manager now; it cannot be recovered from the database.')
  } else {
    console.log('• password set from NI_OWNER_PASSWORD (not printed).')
  }
  if (existing) console.log(`• existing account ${existing.id} was promoted/updated.`)
}

main()
  .catch((error) => {
    console.error('✗ provisioning failed:', error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
