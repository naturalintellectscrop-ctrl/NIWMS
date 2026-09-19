import { describe, expect, it } from 'vitest'
import { EmailConfigurationError, emailEvents, sendEmail, trialCredentialsEmail, trialWarningEmail, dailyDigestEmail, passwordChangedEmail } from '@/lib/email'
import { brandEmailLayout } from '@/lib/email-templates'

describe('email delivery boundary', () => {
  it('fails clearly when delivery is disabled', async () => {
    // Pin the provider explicitly: bun auto-loads .env, so the ambient value
    // depends on the sandbox. The tested invariant is the disabled state.
    const previous = process.env.EMAIL_PROVIDER
    process.env.EMAIL_PROVIDER = 'disabled'
    try {
      await expect(sendEmail(emailEvents.dailyReminder('employee@example.test'))).rejects.toBeInstanceOf(EmailConfigurationError)
    } finally {
      if (previous === undefined) delete process.env.EMAIL_PROVIDER
      else process.env.EMAIL_PROVIDER = previous
    }
  })

  it('keeps event copy provider-independent', () => {
    expect(emailEvents.paymentFailure('owner@example.test')).toMatchObject({
      to: 'owner@example.test',
      subject: 'Payment action required',
    })
  })
})

describe('branded HTML email templates', () => {
  it('lays out the brand structure with escaped dynamic content', () => {
    const html = brandEmailLayout({
      heading: 'Workspace for <Acme & Co> is ready',
      intro: 'Sign in to get started.',
      highlight: { label: 'Credentials', rows: [['Password', 'x<y>&"\'']], note: 'Shown once.' },
      sections: [{ title: 'Details', lines: ['Trial ends soon.'] }],
    })
    expect(html).toContain('Natural Intellects')
    expect(html).toContain('#123c36')
    expect(html).toContain('#c47b32')
    // Dynamic values are escaped, never raw.
    expect(html).toContain('&lt;Acme &amp; Co&gt;')
    expect(html).toContain('x&lt;y&gt;&amp;&quot;&#39;')
    expect(html).not.toContain('<Acme')
    // Structure pieces are present.
    expect(html).toContain('Credentials')
    expect(html).toContain('Details')
    expect(html).toContain('Sign in to get started.')
  })

  it('every integration builder ships both text and branded HTML', () => {
    const builders = [
      trialCredentialsEmail({
        to: 'owner@example.test',
        organizationName: 'Acme',
        adminUsername: 'owner@example.test',
        temporaryPassword: 'temp-pass-123',
        slug: 'acme',
        trialEndsAt: new Date('2026-10-01T00:00:00Z'),
      }),
      trialWarningEmail({ to: 'owner@example.test', organizationName: 'Acme', daysLeft: 2, trialEndsAt: new Date('2026-10-01T00:00:00Z') }),
      dailyDigestEmail({ to: 'owner@example.test', organizationName: 'Acme', message: '2 of 2 daily reports submitted.' }),
      passwordChangedEmail({ to: 'owner@example.test', when: new Date('2026-09-18T12:00:00Z') }),
    ]
    for (const message of builders) {
      expect(message.text.length).toBeGreaterThan(0)
      expect(message.html, `${message.subject} should include an HTML rendering`).toBeTruthy()
      expect(message.html).toContain('Natural Intellects')
      expect(message.html).toContain('#123c36')
    }
    // Credentials only ever appear in the credentials mail's highlight box.
    expect(builders[0].html).toContain('temp-pass-123')
    expect(builders[1].html).not.toContain('temp-pass-123')
  })

  it('wraps singular/plural trial timing copy consistently across text and HTML', () => {
    const oneDay = trialWarningEmail({ to: 'o@example.test', organizationName: 'Acme', daysLeft: 1, trialEndsAt: new Date() })
    const zeroDays = trialWarningEmail({ to: 'o@example.test', organizationName: 'Acme', daysLeft: 0, trialEndsAt: new Date() })
    expect(oneDay.subject).toContain('in 1 day')
    expect(oneDay.subject).not.toContain('1 days')
    expect(zeroDays.subject).toContain('ends today')
    expect(oneDay.html).toContain('in 1 day')
    expect(zeroDays.html).toContain('ends today')
  })
})
