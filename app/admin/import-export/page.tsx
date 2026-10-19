import { requireAdmin } from "../../auth/requireAdmin";
import { CsvImportForm } from "./csv-import-form";

/**
 * Import and export (task 03-03).
 *
 * The first slice of this section is a read-only CSV dry run: upload, validate,
 * inspect the preview. Merge commits, JSON backups and SQL exports are later
 * tasks and are listed below so the page never implies they exist.
 */
export default async function ImportExportPage() {
  await requireAdmin();

  return (
    <section className="max-w-5xl">
      <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
        Import and export
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Bulk-load collection data and produce restorable backups. The CSV
        preview below validates an upload without writing any records.
      </p>

      <CsvImportForm />

      <div className="mt-8 rounded-lg border border-dashed border-border bg-surface-raised p-5">
        <h2 className="text-sm font-semibold text-foreground">Not built yet</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <span className="font-medium text-foreground">03-04:</span>{" "}
            merge-resolution workflow for committing previewed rows and
            updating existing records.
          </li>
          <li>
            <span className="font-medium text-foreground">03-05:</span> JSON
            backup export with a media manifest and checksums.
          </li>
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
