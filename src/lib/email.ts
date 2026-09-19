import { db } from '@/lib/db'
import { brandEmailLayout } from '@/lib/email-templates'

/**
 * Email delivery with a provider adapter:
 *
 *  - EMAIL_PROVIDER=outbox (default, sandbox-friendly): the persisted
 *    EmailMessage row IS the delivery — platform staff can read everything in
 *    the Control Center outbox without any external service.
 *  - EMAIL_PROVIDER=smtp: real delivery through nodemailer using SMTP_HOST /
 *    SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASSWORD / EMAIL_FROM. Every
 *    attempt is recorded (sent or failed + error) in the same outbox table.
 *  - EMAIL_PROVIDER=disabled: sending throws EmailConfigurationError.
 *
 * Integration code should use queueEmail(): it never throws and never blocks
 * the parent flow (report submission, provisioning, cron) on email problems.
 */

export type EmailCategory =
  | 'trial_credentials'
  | 'trial_warning'
  | 'daily_digest'
  | 'password_changed'
  | 'system'

export type OutgoingEmail = {
  to: string
  subject: string
  text: string
  /** Branded HTML rendering — persisted alongside the text body when provided. */
  html?: string
  category: EmailCategory
  organizationId?: string | null
}

export class EmailConfigurationError extends Error {
  constructor() {
    super('Email delivery is not configured')
    this.name = 'EmailConfigurationError'
  }
}

export type EmailProvider = 'smtp' | 'outbox' | 'disabled'

// Fail-safe default: email stays OFF until explicitly configured. Set
// EMAIL_PROVIDER=outbox (sandbox / platform-visible outbox) or =smtp (with
// SMTP_HOST + EMAIL_FROM) to enable delivery.
export function getEmailProvider(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'smtp' || raw === 'outbox') return raw
  return 'disabled'
}

async function sendViaSmtp(message: OutgoingEmail): Promise<void> {
  const host = process.env.SMTP_HOST
  const from = process.env.EMAIL_FROM
  if (!host || !from) throw new EmailConfigurationError()
  // Lazy import: the dependency is only loaded when SMTP is actually used.
  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
  })
  await transport.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
}

export type EmailDeliveryResult = {
  status: 'sent' | 'failed' | 'skipped'
  provider: EmailProvider
  error?: string
}

export async function sendEmail(message: OutgoingEmail): Promise<EmailDeliveryResult> {
  const provider = getEmailProvider()
  if (provider === 'disabled') throw new EmailConfigurationError()

  if (provider === 'smtp') {
    try {
      await sendViaSmtp(message)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      await db.emailMessage.create({
        data: {
          organizationId: message.organizationId ?? null,
          toEmail: message.to,
          subject: message.subject,
          body: message.text,
          html: message.html ?? null,
          category: message.category,
          status: 'failed',
          provider: 'smtp',
          error: detail,
        },
      })
      return { status: 'failed', provider, error: detail }
    }
    await db.emailMessage.create({
      data: {
        organizationId: message.organizationId ?? null,
        toEmail: message.to,
        subject: message.subject,
        body: message.text,
        html: message.html ?? null,
        category: message.category,
        status: 'sent',
        provider: 'smtp',
        sentAt: new Date(),
      },
    })
    return { status: 'sent', provider }
  }

  // Outbox provider: persisting the row IS the delivery.
  await db.emailMessage.create({
    data: {
      organizationId: message.organizationId ?? null,
      toEmail: message.to,
      subject: message.subject,
      body: message.text,
      html: message.html ?? null,
      category: message.category,
      status: 'sent',
      provider: 'outbox',
      sentAt: new Date(),
    },
  })
  return { status: 'sent', provider: 'outbox' }
}

/** Fire-and-forget delivery for integration points — never throws. */
export async function queueEmail(message: OutgoingEmail): Promise<EmailDeliveryResult | null> {
  try {
    return await sendEmail(message)
  } catch (error) {
    if (error instanceof EmailConfigurationError) return null
    // Persist the failure so platform staff can see what went wrong.
    try {
      await db.emailMessage.create({
        data: {
          organizationId: message.organizationId ?? null,
          toEmail: message.to,
          subject: message.subject,
          body: message.text,
          html: message.html ?? null,
          category: message.category,
          status: 'failed',
          provider: getEmailProvider(),
          error: error instanceof Error ? error.message : String(error),
        },
      })
    } catch (persistError) {
      console.error('Email delivery and outbox persistence both failed:', persistError)
    }
    return { status: 'failed', provider: getEmailProvider(), error: String(error) }
  }
}

// =====================================================================
// Generic event copy (provider-independent; used by callers that only
// need a standard subject/body pair without a category context)
// =====================================================================

export const emailEvents = {
  welcome: (to: string): OutgoingEmail => ({ to, subject: 'Welcome to Natural Intellects', text: 'Your organization workspace is ready.', category: 'system' }),
  trialWarning: (to: string): OutgoingEmail => ({ to, subject: 'Your trial is ending soon', text: 'Your Natural Intellects trial is ending soon.', category: 'trial_warning' }),
  paymentFailure: (to: string): OutgoingEmail => ({ to, subject: 'Payment action required', text: 'Your latest payment could not be completed.', category: 'system' }),
  dailyReminder: (to: string): OutgoingEmail => ({ to, subject: 'Daily report reminder', text: 'Please submit your daily report before the reporting deadline.', category: 'system' }),
}

// =====================================================================
// Message builders (shared wording for every integration point)
// =====================================================================

export function trialCredentialsEmail(input: {
  to: string
  organizationName: string
  adminUsername: string
  temporaryPassword: string
  slug: string
  trialEndsAt: Date
  loginUrl?: string
}): OutgoingEmail {
  return {
    to: input.to,
    subject: `Your Natural Intellects trial workspace is ready — ${input.organizationName}`,
    category: 'trial_credentials',
    text: [
      `Hello,`,
      ``,
      `Your 14-day Natural Intellects trial workspace for ${input.organizationName} is ready.`,
      ``,
      `Sign in at ${input.loginUrl ?? '/login'} with:`,
      `  Administrator email: ${input.adminUsername}`,
      `  Temporary password:  ${input.temporaryPassword}`,
      ``,
      `Workspace slug: ${input.slug}`,
      `Trial ends: ${input.trialEndsAt.toLocaleDateString()}`,
      ``,
      `You will be asked to set a new password the first time you sign in.`,
      `Share these credentials securely — they are not shown anywhere else.`,
      ``,
      `— Natural Intellects Ltd`,
    ].join('\n'),
    html: brandEmailLayout({
      heading: `Your trial workspace for ${input.organizationName} is ready`,
      intro: 'Your 14-day Natural Intellects trial starts now. Sign in with the temporary credentials below — you will set your own password on first login.',
      highlight: {
        label: 'Sign-in credentials — shown only once',
        rows: [
          ['Administrator email', input.adminUsername],
          ['Temporary password', input.temporaryPassword],
        ],
        note: 'Share these credentials securely — they are not shown anywhere else.',
      },
      sections: [
        {
          title: 'Workspace details',
          lines: [
            `Workspace: ${input.organizationName} (slug: ${input.slug})`,
            `Trial ends: ${input.trialEndsAt.toLocaleDateString()}`,
            `Sign-in page: ${input.loginUrl ?? '/login'}`,
          ],
        },
        {
          lines: [
            'Your reports, employees, and settings stay intact for the whole trial — no payment details required.',
          ],
        },
      ],
    }),
  }
}

export function trialWarningEmail(input: {
  to: string
  organizationName: string
  daysLeft: number
  trialEndsAt: Date
}): OutgoingEmail {
  const when = input.daysLeft === 0 ? 'today' : `in ${input.daysLeft} day${input.daysLeft === 1 ? '' : 's'}`
  return {
    to: input.to,
    subject: `Action needed: your Natural Intellects trial ends ${when}`,
    category: 'trial_warning',
    text: [
      `Hello,`,
      ``,
      `Your Natural Intellects trial for ${input.organizationName} ends ${when} (${input.trialEndsAt.toLocaleDateString()}).`,
      ``,
      `Contact us to choose a plan and keep your workspace — your reports and history stay intact.`,
      ``,
      `— Natural Intellects Ltd`,
    ].join('\n'),
    html: brandEmailLayout({
      heading: `Your trial for ${input.organizationName} ends ${when}`,
      intro: `Renew or choose a plan before ${input.trialEndsAt.toLocaleDateString()} to keep your workspace running without interruption.`,
      sections: [
        {
          title: 'What stays intact',
          lines: [
            'Every daily and monthly report your team has submitted.',
            'Your employee roster and workspace settings.',
            'Your reporting schedule and reminder preferences.',
          ],
        },
        {
          lines: [
            'Contact Natural Intellects Ltd to pick the plan that fits your team — your workspace continues exactly where it left off.',
          ],
        },
      ],
    }),
  }
}

export function dailyDigestEmail(input: {
  to: string
  organizationName: string
  message: string
}): OutgoingEmail {
  return {
    to: input.to,
    subject: `Daily reporting digest — ${input.organizationName}`,
    category: 'daily_digest',
    text: [
      `Hello,`,
      ``,
      input.message,
      ``,
      `— Natural Intellects Workforce Management System`,
    ].join('\n'),
    html: brandEmailLayout({
      heading: `Daily reporting digest — ${input.organizationName}`,
      intro: input.message,
      sections: [
        {
          lines: [
            'Open your NIWMS workspace for the full picture: submissions, top reporters, and anyone still to report today.',
          ],
        },
      ],
    }),
  }
}

export function passwordChangedEmail(input: { to: string; when: Date }): OutgoingEmail {
  return {
    to: input.to,
    subject: 'Your Natural Intellects password was changed',
    category: 'password_changed',
    text: [
      `Hello,`,
      ``,
      `The password for your Natural Intellects account (${input.to}) was changed on ${input.when.toLocaleString()}.`,
      ``,
      `If this was you, no action is needed. If you did not make this change, contact your organization administrator immediately.`,
      ``,
      `— Natural Intellects Ltd`,
    ].join('\n'),
    html: brandEmailLayout({
      heading: 'Your password was changed',
      intro: `The password for your Natural Intellects account (${input.to}) was changed on ${input.when.toLocaleString()}.`,
      sections: [
        {
          title: 'Was this you?',
          lines: [
            'If yes — no action is needed; all other sessions were signed out automatically.',
            'If not — contact your organization administrator immediately.',
          ],
        },
      ],
    }),
  }
}
