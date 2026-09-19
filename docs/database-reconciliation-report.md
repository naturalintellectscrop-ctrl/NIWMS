# Database reconciliation report

Date: 2026-09-07
Classification: **C — INCOMPLETE**

## 1. Database identity

The repository datasource is PostgreSQL and reads `DATABASE_URL`. The active project database was inspected through the project environment without printing credentials. Safe identity observed: database `neondb`, schema `public`, role `neondb_owner`, Neon host family `us-east-1`. The database contains a `neon_auth` schema and a `public` application schema.

No destructive command, migration deployment, reset, `db push`, or `migrate resolve` was run.

## 2. Live schema inventory

Application tables in `public`:

- `organizations`
- `organization_memberships`
- `plans`
- `subscriptions`
- `billing_events`
- `audit_logs`
- `usage_events`
- `deletion_requests`

Neon Auth tables in `neon_auth`:

- `account`, `invitation`, `jwks`, `member`, `organization`, `project_config`, `session`, `user`, `verification`

The live database does not contain the repository's legacy-style singular tables such as `User`, `DailyReport`, `MonthlyReport`, `EmployeeProfile`, `Notification`, or `AuditLog` in the public schema.

## 3. Repository schema inventory

The repository Prisma schema contains two overlapping model families:

Commercial-style legacy application models: `User`, `Organization`, `OrganizationMember`, `OrganizationSettings`, `Plan`, `Subscription`, `AuditEvent`, `PasswordResetRequest`, `DailyReport`, `MonthlyReport`, `EmployeeProfile`, `Notification`.

Canonical SaaS models mapped to the live plural tables: `SaaSOrganization`, `SaaSOrganizationMembership`, `SaaSPlan`, `SaaSSubscription`, `SaaSBillingEvent`, `SaaSAuditLog`, `SaaSUsageEvent`, `SaaSDeletionRequest`.

The generated baseline migration contains both families. It is therefore not a valid migration to apply to the existing database without a reviewed reconciliation migration.

## 4. Reconciliation matrix

| Object | Repository | Live DB | Difference | Risk | Required action |
| --- | --- | --- | --- | --- | --- |
| Organizations | `Organization` and mapped `SaaSOrganization` | `public.organizations` | Competing model families; live table matches mapped SaaS family | Critical | Make one canonical model family explicit before migration |
| Memberships | `OrganizationMember` and mapped SaaS membership | `public.organization_memberships` | Competing IDs/types and names | Critical | Reconcile application queries and schema together |
| Plans | `Plan` and mapped `SaaSPlan` | `public.plans` | Competing columns; live table matches mapped SaaS family | Critical | Inspect full live columns and migrate code deliberately |
| Subscriptions | `Subscription` and mapped SaaS subscription | `public.subscriptions` | Competing columns and timestamp mappings | Critical | Produce a reviewed forward migration only after mapping |
| Billing events | mapped `SaaSBillingEvent` | `public.billing_events` | Likely additive/mapped, exact constraints not fully proven | High | Compare all columns, indexes, and constraints |
| Audit logs | `AuditLog`, `AuditEvent`, and mapped SaaS audit log | `public.audit_logs` | Multiple repository concepts map to one live table | High | Define retention, actor, and tenant semantics |
| Usage events | mapped `SaaSUsageEvent` | `public.usage_events` | Candidate match; exact JSON/index/default parity unproven | Medium | Verify catalog details before migration |
| Deletion requests | mapped `SaaSDeletionRequest` | `public.deletion_requests` | Candidate match; exact type/default parity unproven | High | Verify lifecycle and retention semantics |
| Auth | repository JWT `User` | `neon_auth.*` | App auth path does not use Neon Auth schema | Critical | Choose one auth boundary; do not mix silently |
| Reports/employees/notifications | legacy repository models | No corresponding live tables observed | Missing in DB | Critical | Create reviewed staging schema or migrate app to canonical design |

## 5. Legacy/UFMI boundary

**Commercial tables/models:** the repository's reporting and SaaS domain models are intended for the commercial application, including users, organizations, memberships, employees, reports, notifications, plans, subscriptions, billing events, usage, audit, and deletion requests.

**Legacy/UFMI tables/models:** no separate UFMI tables were observed in the inspected commercial Neon database. The repository's older singular reporting models are not proven to be UFMI production models; they are a legacy application model family in this repository and must not be deleted or renamed until ownership is confirmed. The `organizationType = LEGACY` behavior is an application-level compatibility path, not proof of a separate database.

UFMI production was not accessed or modified.

## 6. Migration strategy

Use a controlled transitional strategy:

1. Treat the existing commercial Neon schema as an external baseline, not as equivalent to the generated combined baseline.
2. Keep the fresh-database baseline only for disposable environments; do not apply it to the existing database.
3. Create a schema-owned staging database and choose one canonical model family.
4. Generate a forward migration from the chosen canonical schema after data mapping is reviewed.
5. Test that migration against a clone/snapshot of the commercial schema before any production action.
6. Only consider migration resolution after exact equivalence is demonstrated.

This is safer than `migrate resolve --applied` or `db push` because the repository and live schema currently disagree materially.

## 7. Migration files

- Existing: `prisma/migrations/00000000000000_baseline/migration.sql` — fresh-environment baseline only; not safe for current commercial Neon.
- No new production migration was created because the required model-boundary decision is unresolved.

## 8. Existing-data preservation

No existing records were modified. The primary risks are duplicate model families, differing identifier types, missing reporting tables, and the mismatch between repository JWT users and Neon Auth tables. Any attempted automatic reconciliation could reinterpret or orphan real data, so it was intentionally not performed.

## 9–15. Test and infrastructure status

- Repository quality gates previously passed: tests, lint, TypeScript, build, and diff checks.
- Live migration status reports the baseline as unapplied; this is expected because it was not safely equivalent to the existing schema.
- Fresh database certification is **NOT VERIFIED** because no disposable PostgreSQL database was provisioned in this phase.
- Existing-database staging clone test is **NOT VERIFIED** because no clone/snapshot was available through the current project surface.
- Authenticated E2E and cross-tenant tests are **NOT VERIFIED**; synthetic staging accounts were not created against a separate database.
- Reminder logic has a server-side submission check and duplicate guard in code, but provider-backed email delivery is **NOT VERIFIED**.
- Lifecycle code is implemented, but full state-machine enforcement against a canonical schema is **NOT VERIFIED**.
- Backup/PITR/restore drill is **NOT VERIFIED**. No claim is made that Neon recovery capabilities were exercised.

## 16. Migration workflow

The safe workflow is: reviewed migration generation -> fresh database apply -> schema/constraint checks -> staging clone apply -> synthetic authenticated tests -> backup/restore readiness -> explicit production approval -> production migration. The Prisma wrapper now refuses `migrate reset` and `db push` when `NODE_ENV=production` or `VERCEL_ENV=production`.

## 17. Remaining blockers

1. Decide whether the application will use the mapped SaaS tables or the singular repository models.
2. Reconcile JWT `User` authentication with the live `neon_auth` identity system.
3. Provision a separate staging database and synthetic accounts.
4. Obtain a disposable clone/snapshot for migration rehearsal.
5. Verify backup/PITR/restore through an actual non-production drill.
6. Configure real email and payment providers only after database/staging certification.

## 18. Exact next phase

Create a separate staging database, select the canonical SaaS model boundary, refactor only the affected data-access layer in staging, generate a reviewed forward migration, rehearse it against a disposable clone, and run authenticated tenant-isolation tests. Do not touch the current commercial database or UFMI production until those artifacts pass review.
