# Prisma migration baseline

A baseline migration was generated at `prisma/migrations/00000000000000_baseline/migration.sql` from the checked-in Prisma schema. It is intended for fresh commercial SaaS environments and controlled staging deployment.

The connected Neon commercial database was inspected through the project integration and contains the mapped SaaS tables, but it was not marked as migrated or modified in this milestone. The live database also differs from the combined repository schema in legacy tables and timestamp/constraint details, so applying the baseline to that existing database requires a reviewed, environment-specific migration plan. Do not run `migrate reset`, `db push`, or `migrate deploy` against UFMI.

For a fresh staging database, review the SQL, set `DATABASE_URL` to that staging database, then apply the baseline through the normal Prisma deployment process. For the existing commercial Neon database, first reconcile the legacy model boundary and schema diff, take a provider backup, and use `prisma migrate resolve --applied 00000000000000_baseline` only after the database has been proven equivalent to the migration's intended schema.
