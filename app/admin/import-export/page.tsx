import { requireAdmin } from "../../auth/requireAdmin";
import { CsvImportForm } from "./csv-import-form";
import { JsonBackupExportForm } from "./json-backup-export-form";

/**
 * Import and export (task 03-05).
 *
 * CSV import includes the full merge workflow (03-04). JSON backup export with
 * media manifest and checksums (03-05) is now available; SQL export remains
 * planned for 03-06.
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

      <div className="mt-8 rounded-lg border border-dashed border-border bg-surface-raised p-5">
        <h2 className="text-sm font-semibold text-foreground">Not built yet</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <span className="font-medium text-foreground">03-06:</span> SQL
            export and restore safeguards that never run destructively by
            default.
          </li>
        </ul>
      </div>
    </section>
  );
}
