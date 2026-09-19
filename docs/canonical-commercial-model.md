# Canonical commercial model decision

Date: 2026-09-07

## Decision

**Canonical commercial model family: Option C — deliberate hybrid, with one commercial tenant boundary.**

This is not a compatibility shortcut. The evidence requires two bounded persistence concerns:

1. The mapped SaaS family is canonical for the commercial tenant, plan, subscription, billing event, audit, usage, and deletion lifecycle tables that already exist in the live Neon database.
2. A reporting domain is required for employees, profiles, departments, positions, daily reports, monthly reports, and notifications. Those tables are absent from the live public schema, so they must be introduced as new commercial tables in staging first. They are not treated as a second organization architecture.
3. User identity is an external boundary. The live `neon_auth` schema is not used by the current JWT application, so identity reconciliation is a prerequisite for production migration. The reporting domain must reference one canonical application identity key (`userId`) and the SaaS membership `user_id`; it must not create a second organization or membership graph.

## Why this is the smallest coherent architecture

The SaaS tables are the only observed commercial tables in the live database and have UUID identifiers, explicit lifecycle records, billing-event idempotency, usage, audit, and deletion-request semantics. They are therefore the canonical platform boundary.

The singular Prisma family is not a duplicate in every case. Its reporting entities are the only implementation of the actual product workflow, but its `Organization`, `OrganizationMember`, `Plan`, `Subscription`, and `AuditEvent` models duplicate the live SaaS boundary. Those duplicated singular platform models must not be used for new commercial code.

The reporting tables cannot be mapped onto `organizations`, `subscriptions`, or `audit_logs`: their fields and cardinalities do not represent employee reports, report exports, notifications, or employee profiles. Creating them as bounded reporting tables is safer than pretending they already exist or renaming live tables.

## Canonical model matrix

| Business entity | Canonical Prisma model | DB table | Previous model | Action |
| --- | --- | --- | --- | --- |
| Organization | `SaaSOrganization` | `organizations` | `Organization` | Canonicalize platform access around this model; do not rename live table |
| Membership | `SaaSOrganizationMembership` | `organization_memberships` | `OrganizationMember` | Canonicalize tenant membership around this model |
| Plan | `SaaSPlan` | `plans` | `Plan` | Canonicalize billing plans around this model |
| Subscription | `SaaSSubscription` | `subscriptions` | `Subscription` | Canonicalize lifecycle/billing lookup around this model |
| Billing event | `SaaSBillingEvent` | `billing_events` | none | Keep as provider idempotency ledger |
| Audit | `SaaSAuditLog` | `audit_logs` | `AuditLog`, `AuditEvent` | Canonicalize platform audit around this model |
| Usage | `SaaSUsageEvent` | `usage_events` | none | Keep as usage ledger |
| Deletion request | `SaaSDeletionRequest` | `deletion_requests` | none | Keep as retention workflow |
| Identity | External Neon Auth or one staged application identity adapter | `neon_auth.*` or staged adapter table | `User` | Unresolved migration boundary; no production change |
| Employee | New reporting-domain model | New staging table | none | Add only after identity adapter is agreed |
| Employee profile | New reporting-domain model | New staging table | `EmployeeProfile` | Generalize, do not bind to legacy `Organization` |
| Department | New reporting-domain model | New staging table | legacy UI concepts | Add in reporting domain |
| Position | New reporting-domain model | New staging table | `EmployeeProfile.position` | Normalize in reporting domain |
| Daily report | New reporting-domain model | New staging table | `DailyReport` | Generalize, scoped by canonical membership/user key |
| Monthly report | New reporting-domain model | New staging table | `MonthlyReport` | Generalize, scoped by canonical membership/user key |
| Notification | New reporting-domain model | New staging table | `Notification` | Generalize, scoped by canonical membership/user key |

## Business-flow trace

- Authentication currently uses the singular `User` table and JWT cookie. This is not compatible with the live Neon Auth boundary without an explicit adapter decision.
- Organization context currently resolves through singular `User.organizationId` and `OrganizationMember`; this is the primary application refactor required next.
- Employee and reporting routes use `User`, `EmployeeProfile`, `DailyReport`, `MonthlyReport`, and `Notification`. These entities have no equivalent in the live SaaS tables and therefore require a new reporting-domain schema.
- Billing, lifecycle, retention, and platform tables already have a stronger live representation in the mapped SaaS family.
- The current code must not be remapped piecemeal. Auth, tenant context, employee lookup, reporting, notifications, billing, lifecycle, and audit must move behind one adapter boundary in a later staging phase.

## UFMI boundary

UFMI is not migrated by this decision. Any legacy-only models or routes not included in the commercial adapter remain outside the commercial schema. No UFMI production table, data, credential, or route was changed.

## Safe implementation boundary

This phase makes no production schema change and does not apply a migration. The next implementation phase must:

1. provision a disposable/staging PostgreSQL database;
2. choose the identity adapter (`neon_auth` integration or staged application identity table);
3. add reporting-domain models tied to canonical SaaS membership/user keys;
4. refactor all commercial routes through the adapter together;
5. execute tenant-isolation, reporting, billing, lifecycle, audit, and export E2E tests;
6. generate a reviewed forward migration only after staging proves the model.

Until those gates pass, the application is classified **C — INCOMPLETE** for production migration readiness.
