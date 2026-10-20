# SQL backup and restore safeguards (task 03-06)

This project does **not** perform database-level SQL dumps from the browser or from the Next.js application runtime. Database-level export/import requires privileged database access (superuser/service role / direct Postgres connection) and CLI tools such as `pg_dump`/`pg_restore` or the Supabase CLI. Exposing those operations via an unauthenticated/weakly-scoped browser endpoint would be unsafe and is intentionally not implemented.

## What the app *can* do safely

- **JSON backup export** (implemented in 03-05): admin-only export of application data via `app/lib/export/backup.ts` using the existing RLS-enforced admin access path (anon key + `is_admin()` check). This is a logical export (table rows as JSON) with a media manifest. It is **not** a full Postgres schema dump and does not capture extensions, roles/grants, RLS policies, triggers, storage bucket configuration, or system catalogs.
- **CSV import/merge** (03-03/03-04): logical data import with validation and safeguards.

## Safe SQL export procedures (choose one)

### Option 1: Supabase CLI (local or linked project)
If you have the Supabase CLI and access to your project/database:

```bash
# Dump schema + data (adjust as needed)
supabase db dump --linked > backup-$(date +%Y%m%d-%H%M%S).sql

# Or dump schema only / data only depending on needs
supabase db dump --linked --schema-only > schema.sql
supabase db dump --linked --data-only > data.sql
```

Notes:
- Requires CLI authentication/linking and appropriate permissions.
- Respect your provider's terms and environment (local vs hosted).
- Store dumps securely (they may contain sensitive data).

### Option 2: pg_dump directly
If you have a direct Postgres connection string (with sufficient privileges):

```bash
pg_dump "postgresql://user:password@host:port/dbname" \
  --format=plain \
  --no-owner \
  --no-privileges \
  > backup.sql
```

Notes:
- `pg_dump` is not present in this environment and must be run from a trusted machine with DB credentials.
- Use least-privilege accounts where possible; avoid running from shared/public machines.
- The `--no-owner`/`--no-privileges` flags can help when restoring to a different role setup, but you must still review grants/policies.

### Option 3: Provider backups (recommended for production)
- **Supabase**: use Point-in-Time Recovery (PITR) if enabled on your plan, or project backups as provided by your hosting/provider. These are managed outside the app.
- **Vercel/hosting**: follow your provider's backup/restore documentation.

## Restore safeguards (design)

Restoration is **separately confirmed and never automatic**. Any restore procedure must follow:

1. **Format/version validation**: verify the SQL file is from a known backup (source, timestamp, app version/schema version/migration set). Reject untrusted files.
2. **Preview**: inspect the SQL (tables/operations) before execution. Never execute arbitrary uploaded SQL in the browser.
3. **Explicit destructive-action warning**: restoring overwrites data. Require explicit confirmation (e.g., typed confirmation like "RESTORE" and acknowledgment of data loss).
4. **Environment targeting safeguards**: never point restore at production by default. Use a staging/local copy first. Verify connection target before running any restore command.
5. **Least privilege**: use dedicated restore credentials; revoke after use.
6. **No in-app execution**: the app will not execute uploaded SQL. Restoration must be done via CLI/psql/Supabase CLI by an authorized operator in a controlled environment.
7. **Rollback plan**: have a pre-restore backup/snapshot and know how to roll back (PITR/provider rollback if available).

## Limits (be honest)

- **PITR**: availability depends on your Supabase/hosting plan and settings. Not guaranteed in all environments.
- **Provider settings**: some providers restrict direct DB access or require specific roles.
- **Permissions**: `pg_restore`/schema changes may require owner/superuser privileges. RLS policies, grants, storage buckets, and auth configuration may need separate handling.
- **App scope**: logical JSON export (03-05) cannot reconstruct full database state (roles, extensions, policies, storage objects/metadata outside the tracked tables, etc.). SQL dumps are the correct tool for full restores.

## Verification checklist

- [ ] Confirm environment supports CLI tools before attempting export/restore.
- [ ] Create a verified backup (SQL or provider snapshot) before any restore.
- [ ] Test restore in a non-production environment first.
- [ ] Validate app functionality after restore (migrations applied, RLS intact, admin access configured).
- [ ] Document the backup/restore event and operator.
