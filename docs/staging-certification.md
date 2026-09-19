# Staging certification package

## Status

This repository now has a guarded synthetic seed harness, but staging execution is blocked until a separate PostgreSQL database is provisioned. The harness refuses to run unless `STAGING_DATABASE_URL` is set and `STAGING_CONFIRM=true`; it never consumes the commercial `DATABASE_URL` implicitly.

## Synthetic accounts

- Platform: `superadmin@staging.invalid`
- Tenant A: `admin@acme.staging.invalid`, `acme1@staging.invalid` through `acme3@staging.invalid`
- Tenant B: `admin@bluewave.staging.invalid`, `bluewave1@staging.invalid` through `bluewave3@staging.invalid`
- Password: supplied only through `STAGING_SEED_PASSWORD`

The seed creates organizations, memberships, settings, starter subscription records, employee profiles, and synthetic daily reports. It uses no real personal information.

## Execution gate

Run only against a disposable/staging database after provisioning:

```text
STAGING_DATABASE_URL=<separate database URL>
STAGING_CONFIRM=true
STAGING_SEED_PASSWORD=<synthetic password>
node scripts/staging-seed.js
```

Do not point this at the commercial Neon URL. Authenticated browser tests remain blocked until the accounts exist in staging.

## Required E2E cases

1. Platform admin: login, organizations, plans, subscriptions, lifecycle, audit.
2. Tenant A admin: employees, departments, positions, reports, monthly reports, export, notifications, settings, billing.
3. Tenant A employee: own profile, daily report, history, monthly report, export, logout.
4. Direct ID manipulation from Tenant A to Tenant B returns denied/not found for employees, reports, monthly reports, exports, notifications, billing, and settings.
5. Reminder scheduler: submitted employee skipped, missing report reminded, second run creates no duplicate, timezone boundary uses each tenant timezone.
6. Lifecycle: trial, active, grace, suspended, retention eligibility, pending deletion; legacy organization type remains excluded.

## Current result

Not executed. No separate staging database or disposable clone is available through the current project environment.
