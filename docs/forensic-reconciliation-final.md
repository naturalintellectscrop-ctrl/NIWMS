# NIWMS forensic reconciliation

Date: 2026-09-07
Classification: **C — INCOMPLETE**

## A. Model reconciliation

The repository contains two competing model families.

| Model family | Database table | Used by | Classification | Canonical candidate | Risk |
| --- | --- | --- | --- | --- | --- |
| `User`, `Organization`, `OrganizationMember`, `OrganizationSettings`, `Plan`, `Subscription`, `AuditEvent`, `DailyReport`, `MonthlyReport`, `EmployeeProfile`, `Notification`, `PasswordResetRequest` | Prisma default singular names | Authentication, tenant creation, reporting, exports, reminders, notifications, billing routes | Commercial application family, legacy-shaped | Required for current reporting app until deliberately migrated | Critical because these tables are absent from live public schema |
| `SaaSOrganization`, `SaaSOrganizationMembership`, `SaaSPlan`, `SaaSSubscription`, `SaaSBillingEvent`, `SaaSAuditLog`, `SaaSUsageEvent`, `SaaSDeletionRequest` | `organizations`, `organization_memberships`, `plans`, `subscriptions`, `billing_events`, `audit_logs`, `usage_events`, `deletion_requests` | Billing, lifecycle, retention concepts and live schema alignment | Commercial SaaS family | Canonical candidate for billing/lifecycle | Critical because current app reads the other family |
| Neon Auth tables | `neon_auth.*` | Not used by current JWT route | External auth boundary | Unresolved | Critical if mixed with repository JWT users |

Mapping the singular family onto the live plural tables is **not proven safe**. The families differ in identifier types, column names, timestamp names, relation semantics, and report/employee/notification coverage. No automatic mapping or table rename was performed.

### Actual application flow

`/api/auth/login` -> repository `User` -> `organizationId` -> repository `Organization` and `OrganizationMember` -> repository `EmployeeProfile` -> repository `DailyReport` -> repository `MonthlyReport` -> export routes -> repository `Notification` -> repository `AuditLog`/`AuditEvent`.

The live database can provide the mapped SaaS billing/lifecycle tables, but it cannot currently satisfy the reporting flow because the singular reporting tables are absent. Therefore the current commercial app is not proven runnable against the inspected live schema.

### Refactor inventory

Production-critical routes importing `@/lib/db` currently rely on the repository Prisma client and the singular family: authentication, organization context, admin employees/reports/exports, reports, monthly reports, notifications, billing, lifecycle, and reminders. Billing/webhook code also uses the singular `organization`, `subscription`, `plan`, and `auditEvent` models. These routes must be migrated together after the canonical boundary is selected; piecemeal remapping would create mixed-tenant behavior.

## B. Database

Live public tables: `organizations`, `organization_memberships`, `plans`, `subscriptions`, `billing_events`, `audit_logs`, `usage_events`, `deletion_requests`.

Live Neon Auth schema: `account`, `invitation`, `jwks`, `member`, `organization`, `project_config`, `session`, `user`, `verification`.

Repository schema additionally defines singular reporting, employee, notification, and password-reset tables. The generated fresh baseline includes both families and is therefore not safe for the existing database. No production migration is required until the model decision and data mapping are reviewed.

## C. Fresh database

**NOT VERIFIED.** No disposable PostgreSQL database was provisioned. The fullstack initialization helper also failed because its package download encountered a TLS connection error. Prisma schema validation and client generation remain locally successful.

## D. Staging

A guarded `scripts/staging-seed.js` and `docs/staging-certification.md` are prepared. The seed requires `STAGING_DATABASE_URL`, `STAGING_CONFIRM=true`, and `STAGING_SEED_PASSWORD`; it refuses implicit production use. Accounts cover a platform admin, Acme Technologies, and Bluewave Services with synthetic employees and reports. Execution is **BLOCKED BY INFRASTRUCTURE** until a separate database is provisioned.

## E. Security

Pure tenant-boundary regression coverage exists for explicit tenant selection, cross-tenant resource denial, lifecycle access states, organization-admin boundaries, and HttpOnly session cookies. Authenticated API/URL IDOR execution is **NOT VERIFIED** without staging accounts.

## F. Reminders

Reminder policy is now isolated and tested. It skips submitted employees, disabled tenants, and existing reminders; it evaluates 4 PM in each tenant timezone. Duplicate scheduler execution is covered by an idempotency regression test. Provider-backed delivery is not configured or claimed.

## G. Lifecycle

Trial/grace/suspension/retention code exists and retention tests pass. Full `TRIAL -> ACTIVE -> PAST_DUE -> GRACE_PERIOD -> SUSPENDED -> PENDING_DELETION` execution is **NOT VERIFIED**; the current repository lifecycle implementation does not yet demonstrate every requested transition against a canonical database.

## H. Backup/recovery

**NOT VERIFIED.** No disposable clone, PITR restore, branch clone, or recovery drill was available through the current project surface. No backup claim is made.

## I. Production safety

- Production database modified: **No**
- UFMI modified: **No**
- Destructive command executed: **No**
- `migrate resolve` used: **No**
- `db push` used against production: **No**
- Credentials/secrets changed: **No**
- Production destructive Prisma commands are now refused by the repository wrapper.

## J. Canonical commercial model decision

### Option C — deliberate hybrid

The mapped SaaS family is canonical for the commercial tenant, membership, plan, subscription, billing, audit, usage, and deletion lifecycle boundary. Reporting is a separate bounded commercial domain that must be introduced as new staging tables for employees, profiles, departments, positions, daily reports, monthly reports, and notifications. This is not a second organization architecture: reporting must reference the canonical SaaS membership and one identity adapter.

The singular `Organization`, `OrganizationMember`, `Plan`, `Subscription`, and `AuditEvent` models are duplicate platform representations and must not be used for new commercial code. The singular reporting models are retained only as evidence of the current product workflow until generalized into the reporting domain. The live `neon_auth` schema remains an explicit identity boundary; no production identity migration was attempted.

### C — INCOMPLETE

## K. Next phase

Provision one separate staging PostgreSQL database, choose the identity adapter, add reporting-domain tables tied to canonical SaaS membership/user keys, and refactor all commercial routes through one adapter before generating or applying any forward migration.
