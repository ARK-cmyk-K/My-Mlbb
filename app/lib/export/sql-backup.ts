/**
 * SQL backup/restore safeguards (task 03-06).
 *
 * This module documents the safe boundaries. The application does not expose
 * database-level SQL dump/restore operations via HTTP/browser endpoints because
 * they require privileged database access (pg_dump/pg_restore, service role,
 * direct Postgres connection) not available in the app runtime.
 */

export const SQL_BACKUP_SAFEGUARDS = {
  inAppSqlExport: false,
  inAppSqlRestore: false,
  reason:
    "Database-level export/import requires privileged CLI access and direct Postgres credentials; exposing it in the browser is unsafe.",
  safeExportMethods: [
    "supabase db dump (Supabase CLI)",
    "pg_dump (direct Postgres connection)",
    "provider-managed backups / PITR (if enabled)",
  ],
  restoreRequirements: [
    "format/version validation",
    "preview of backup contents before execution",
    "explicit destructive-action warning and separate confirmation",
    "target environment verification (never default to production)",
    "no execution of arbitrary uploaded SQL from the browser",
    "operator has appropriate privileges and rollback plan",
  ],
  limits: {
    pitr: "Depends on provider plan/settings; not guaranteed in all environments.",
    providerSettings: "Direct DB access may be restricted by provider; roles/grants may differ.",
    permissions: "Restore may require owner/superuser privileges; RLS/policies/storage/auth may need separate handling.",
    logicalJsonExport: "JSON backup (03-05) is logical only and does not capture roles, extensions, policies, full storage config, etc.",
  },
  docsPath: "docs/sql-backup-restore.md",
} as const;

export type SqlBackupSafeguards = typeof SQL_BACKUP_SAFEGUARDS;
