import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DAILY_REMINDER_TITLE, getLocalReminderWindow, shouldCreateReminder } from '@/lib/reminder-policy'
import { queueEmail, dailyDigestEmail, trialWarningEmail } from '@/lib/email'
import { cronAuthorized, cronUnauthorizedResponse } from '@/lib/cron-auth'

const DIGEST_TITLE = 'Daily reporting digest'
const TRIAL_WARNING_TITLE = 'Trial ending soon'
const TRIAL_WARNING_DAYS = 3

function formatDeadline(deadline: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(deadline ?? '')
  if (!match) return 'the reporting deadline'
  const hours = Number(match[1])
  const minutes = match[2]
  if (Number.isNaN(hours) || hours > 23) return 'the reporting deadline'
  const suffix = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix} local time`
}

// Task 23 audit fix: exports GET (Vercel cron's method) AND POST; bearer
// comparison is constant-time and also accepts CRON_SECRET.
async function sweep(request: Request) {
  if (!cronAuthorized(request)) {
    return cronUnauthorizedResponse()
  }
  const organizations = await db.saaSOrganization.findMany({ include: { reportingEmployees: { where: { status: 'active' }, include: { membership: true } } } })
  let created = 0
  let digests = 0
  let trialWarnings = 0
  for (const organization of organizations) {
    const now = new Date()
    const orgTimezone = organization.timezone || 'Africa/Kampala'
    const { dateKey, due } = getLocalReminderWindow(now, orgTimezone, organization.reportDeadline)
    const reminderMessage = `Please submit your daily report before ${formatDeadline(organization.reportDeadline)}.`
    for (const employee of organization.reportingEmployees) {
      const submitted = await db.reportingDailyReport.findUnique({ where: { employeeId_reportDate: { employeeId: employee.id, reportDate: dateKey } }, select: { id: true } })
      const exists = await db.reportingNotification.findFirst({ where: { organizationId: organization.id, employeeId: employee.id, type: 'reminder', title: DAILY_REMINDER_TITLE, createdAt: { gte: new Date(`${dateKey}T00:00:00.000Z`) } } })
      if (!shouldCreateReminder({ organization: { ...organization, timezone: orgTimezone, settings: { reminderEnabled: organization.reminderEnabled, reportDeadline: organization.reportDeadline } }, submitted: Boolean(submitted), existingReminder: Boolean(exists), now })) continue
      await db.reportingNotification.create({ data: { organizationId: organization.id, employeeId: employee.id, title: DAILY_REMINDER_TITLE, message: reminderMessage, type: 'reminder' } })
      created += 1
    }

    // Admin digest: one per org admin per day (after the deadline window opens),
    // summarizing real submission state so managers do not need to check manually.
    if (!due || !organization.reminderEnabled) continue
    const submittedEmployeeIds = new Set(
      (await db.reportingDailyReport.findMany({ where: { organizationId: organization.id, reportDate: dateKey }, select: { employeeId: true } })).map((row) => row.employeeId),
    )
    const missing = organization.reportingEmployees
      .filter((employee) => !submittedEmployeeIds.has(employee.id))
      .map((employee) => employee.displayName)
    const total = organization.reportingEmployees.length
    const submittedCount = total - missing.length
    const missingLabel = missing.length === 0
      ? 'Everyone has reported.'
      : `Pending: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}.`
    const digestMessage = `${submittedCount} of ${total} daily reports submitted for ${dateKey}. ${missingLabel}`

    const [saasAdmins, legacyAdmins] = await Promise.all([
      db.saaSOrganizationMembership.findMany({ where: { organizationId: organization.id, status: 'active', role: { in: ['owner', 'admin'] } }, select: { userId: true } }),
      db.user.findMany({ where: { organizationId: organization.id, role: 'admin', status: 'active' }, select: { id: true, username: true } }),
    ])
    const adminUserIds = [...new Set([...saasAdmins.map((m) => m.userId), ...legacyAdmins.map((u) => u.id)])]
    // Membership rows carry no user relation (legacy schema split) — resolve
    // usernames in one extra query so digest emails can be mirrored to admins.
    const adminUsers = adminUserIds.length
      ? await db.user.findMany({ where: { id: { in: adminUserIds } }, select: { id: true, username: true } })
      : []
    const usernameByAdminId = new Map(adminUsers.map((u) => [u.id, u.username]))
    for (const adminUserId of adminUserIds) {
      const exists = await db.notification.findFirst({
        where: { userId: adminUserId, title: DIGEST_TITLE, createdAt: { gte: new Date(`${dateKey}T00:00:00.000Z`) } },
        select: { id: true },
      })
      if (exists) continue
      await db.notification.create({
        data: { userId: adminUserId, title: DIGEST_TITLE, message: digestMessage, type: 'info' },
      })
      digests += 1
      // Mirror the digest into the email outbox for admin addresses.
      const adminUsername = usernameByAdminId.get(adminUserId)
      if (adminUsername && adminUsername.includes('@')) {
        await queueEmail(dailyDigestEmail({ to: adminUsername, organizationName: organization.name, message: digestMessage }))
      }
    }
  }

  // Lifecycle pass: warn organization admins when their trial is about to end
  // so the commercial relationship has an in-product touchpoint. One warning
  // per admin per day, regardless of how often the cron fires.
  const warningHorizon = new Date(Date.now() + TRIAL_WARNING_DAYS * 24 * 60 * 60 * 1000)
  const expiringTrials = await db.saaSOrganization.findMany({
    where: { status: 'trial', trialEndsAt: { lte: warningHorizon, gte: new Date() } },
    select: { id: true, name: true, trialEndsAt: true },
  })
  for (const organization of expiringTrials) {
    const daysLeft = Math.max(0, Math.ceil((organization.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    const warningMessage = `Your Natural Intellects trial for ${organization.name} ends ${daysLeft === 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`} (${organization.trialEndsAt.toLocaleDateString()}). Contact us to choose a plan and keep your workspace.`
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
    const adminMemberIds = await db.saaSOrganizationMembership.findMany({
      where: { organizationId: organization.id, status: 'active', role: { in: ['owner', 'admin'] } },
      select: { userId: true },
    })
    const warningAdminUsers = adminMemberIds.length
      ? await db.user.findMany({ where: { id: { in: adminMemberIds.map((m) => m.userId) } }, select: { id: true, username: true } })
      : []
    for (const adminUser of warningAdminUsers) {
      const exists = await db.notification.findFirst({
        where: { userId: adminUser.id, title: TRIAL_WARNING_TITLE, createdAt: { gte: todayStart } },
        select: { id: true },
      })
      if (exists) continue
      await db.notification.create({
        data: { userId: adminUser.id, title: TRIAL_WARNING_TITLE, message: warningMessage, type: 'warning' },
      })
      trialWarnings += 1
      // Mirror the warning into the email outbox for admin addresses.
      if (adminUser.username.includes('@')) {
        await queueEmail(
          trialWarningEmail({
            to: adminUser.username,
            organizationName: organization.name,
            daysLeft,
            trialEndsAt: organization.trialEndsAt,
          }),
        )
      }
    }
  }
  return NextResponse.json({ created, digests, trialWarnings })
}

export async function GET(request: Request) {
  return sweep(request)
}

export async function POST(request: Request) {
  return sweep(request)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
