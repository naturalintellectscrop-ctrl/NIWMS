/**
 * Branded HTML email templates for Natural Intellects.
 *
 * Layout is deliberately table-based with inline styles: HTML email clients
 * (Outlook, Gmail clipping, dark-mode inversions) ignore most modern CSS, so
 * every message renders the same minimal structure everywhere. The palette
 * matches the product brand: deep green #123c36, gold #c47b32, paper #f4f1e8.
 *
 * Every builder keeps a plain-text counterpart in src/lib/email.ts — the text
 * version is what the outbox shows by default; the HTML version is opt-in
 * preview in the Control Center.
 */

const BRAND = {
  green: '#123c36',
  greenDeep: '#0d2b27',
  gold: '#c47b32',
  goldSoft: '#f0e2d0',
  paper: '#f4f1e8',
  ink: '#161a18',
  muted: '#69706a',
  line: '#e3e0d5',
} as const

const FOOTER_NOTE = 'You are receiving this message because of activity in your Natural Intellects workspace.'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type EmailSection = {
  title?: string
  lines: string[]
}

export type EmailHighlightBox = {
  label: string
  /** [caption, value] rows rendered in a monospace credential panel. */
  rows: Array<[string, string]>
  note?: string
}

export function brandEmailLayout(input: {
  heading: string
  intro?: string
  sections?: EmailSection[]
  highlight?: EmailHighlightBox
}): string {
  const sections = input.sections ?? []
  const sectionHtml = sections
    .map((section) => {
      const title = section.title
        ? `<tr><td style="padding:0 0 8px 0;font-family:Georgia,serif;font-size:16px;font-weight:bold;color:${BRAND.ink};">${escapeHtml(section.title)}</td></tr>`
        : ''
      const lines = section.lines
        .map(
          (line) =>
            `<tr><td style="padding:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${BRAND.muted};">${escapeHtml(line)}</td></tr>`
        )
        .join('')
      return `<tr><td style="padding:0 0 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${title}${lines}</table></td></tr>`
    })
    .join('')

  const highlightHtml = input.highlight
    ? `<tr><td style="padding:0 0 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.goldSoft};border:1px dashed ${BRAND.gold};">
          <tr><td style="padding:16px 18px 4px 18px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#7a4d10;">${escapeHtml(input.highlight.label)}</td></tr>
          ${input.highlight.rows
            .map(
              ([caption, value]) =>
                `<tr><td style="padding:6px 18px;"><span style="display:inline-block;min-width:170px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7a4d10;">${escapeHtml(caption)}</span><span style="font-family:'Courier New',monospace;font-size:13px;font-weight:bold;color:${BRAND.ink};">${escapeHtml(value)}</span></td></tr>`
            )
            .join('')}
          ${
            input.highlight.note
              ? `<tr><td style="padding:10px 18px 16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#7a4d10;">${escapeHtml(input.highlight.note)}</td></tr>`
              : ''
          }
        </table>
      </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${BRAND.paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.paper};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.line};">
      <tr><td style="background:${BRAND.green};padding:22px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-family:Georgia,serif;font-size:18px;color:#ffffff;letter-spacing:1px;">Natural Intellects</td>
            <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8fb3a8;">Workforce clarity</td>
          </tr>
        </table>
        <div style="height:3px;width:56px;background:${BRAND.gold};margin-top:12px;"></div>
      </td></tr>
      <tr><td style="padding:28px 28px 8px 28px;">
        <h1 style="margin:0 0 14px 0;font-family:Georgia,serif;font-size:22px;line-height:30px;color:${BRAND.ink};">${escapeHtml(input.heading)}</h1>
        ${input.intro ? `<p style="margin:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${BRAND.muted};">${escapeHtml(input.intro)}</p>` : ''}
      </td></tr>
      ${highlightHtml}
      ${sectionHtml}
      <tr><td style="padding:8px 28px 0 28px;">
        <div style="height:1px;background:${BRAND.line};"></div>
      </td></tr>
      <tr><td style="padding:16px 28px 26px 28px;">
        <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.ink};">&mdash; Natural Intellects Ltd</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#9aa09a;">${escapeHtml(FOOTER_NOTE)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}
