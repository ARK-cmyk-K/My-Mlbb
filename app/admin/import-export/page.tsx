import { requireAdmin } from "../../auth/requireAdmin";
import { CsvImportForm } from "./csv-import-form";
import { JsonBackupExportForm } from "./json-backup-export-form";

/**
 * Import and export (tasks 03-03 through 03-06).
 *
 * CSV import includes the full merge workflow (03-04). JSON backup export with
 * media manifest and checksums (03-05) is available. SQL export and restore
 * are documented as admin/operator procedures with safeguards (03-06) rather
 * than in-browser destructive operations.
 */
export default async function ImportExportPage() {
  await requireAdmin();

  return (
    <section className="max-w-5xl">
      <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
        Import and export
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Bulk-load collection data with a safe merge workflow. Create an admin-only
        JSON backup of application data with a media manifest containing stable
        IDs, object paths/URLs as appropriate, MIME types, sizes, checksums if
        available, and reference relationships. Draft and private metadata are
        only included in authorized backups.
      </p>

      <CsvImportForm />

      <JsonBackupExportForm />

      <div className="mt-8 space-y-4 rounded-lg border border-border bg-surface-raised p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            SQL export and restore (safeguarded)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Database-level SQL dumps/restores cannot be performed safely from the
            browser. The app provides a logical JSON backup (above); full
            schema/data backups require privileged CLI access.
          </p>
        </div>
        <ul className="space-y-2 text-sm text-muted">
          <li>
            <span className="font-medium text-foreground">Safe export paths:</span>{" "}
            Supabase CLI (<code className="rounded bg-background px-1 py-0.5">supabase db dump</code>),
            <code className="rounded bg-background px-1 py-0.5">pg_dump</code>, or
            provider-managed backups/PITR.
          </li>
          <li>
            <span className="font-medium text-foreground">Restore rules:</span>{" "}
            separately confirmed operation with format/version validation,
            preview, explicit destructive-action warning, environment targeting
            safeguards, and no arbitrary SQL execution from the browser.
          </li>
          <li>
            <span className="font-medium text-foreground">Documentation:</span>{" "}
            see <code className="rounded bg-background px-1 py-0.5">docs/sql-backup-restore.md</code>{" "}
            for procedures, limits (PITR/provider settings/permissions), and
            verification steps.
          </li>
        </ul>
      </div>
    </section>
  );
}
