# Commercial SaaS backup and recovery runbook

This runbook applies only to the commercial SaaS Neon database. Never use it against UFMI or any legacy client database.

## Recovery procedure

1. Identify the incident, affected environment, tenant scope, and last known good timestamp.
2. Stop unsafe writes or disable the affected deployment if continued writes could worsen the incident.
3. Identify the target restore point using the database provider's point-in-time recovery controls.
4. Restore into a separate staging/recovery database first; do not overwrite production during investigation.
5. Validate the Prisma schema and migration history against the restored database.
6. Validate synthetic tenant isolation, organization memberships, lifecycle states, retention records, and audit events.
7. Validate authentication with synthetic accounts only, including expired and suspended organization behavior.
8. Validate subscriptions, billing event idempotency, reminders, daily reports, monthly reports, and exports.
9. Compare recovered data and application health with the incident timeline.
10. Obtain production recovery approval, then execute the provider-approved production restore or controlled data repair.
11. Record the restore point, operator, commands/actions, validation evidence, and follow-up changes in the incident log.

## Current verification boundary

The repository does not prove provider backup retention, point-in-time recovery settings, or a completed restore drill. Those remain staging infrastructure verification requirements. Required evidence before production launch: retention policy, recovery-point objective, recovery-time objective, a successful isolated restore, and a signed validation record.
