"use client";

import { useActionState } from "react";

import { previewCsvImportAction } from "../../actions/import-actions";
import {
  CSV_COLUMNS_BY_ENTITY,
  IMPORT_ENTITIES,
  type ImportEntity,
} from "../../lib/import/columns";
import type { CsvImportState } from "../../lib/import/preview";

const INITIAL_STATE: CsvImportState = {};

/** Preview tables are capped so a 1,000-row file stays responsive. */
const MAX_ROWS_SHOWN = 50;
const MAX_ERRORS_SHOWN = 100;

/**
 * CSV dry-run form (task 03-03).
 *
 * Uploads the file to a Server Action that validates it and returns a preview.
 * The client only renders that result; it never parses, trusts or persists the
 * file. The downloadable error report is the formula-neutralized CSV built on
 * the server.
 */
export function CsvImportForm() {
  const [state, formAction, pending] = useActionState(
    previewCsvImportAction,
    INITIAL_STATE
  );
  const preview = state.preview;

  const downloadErrorReport = (): void => {
    if (!preview?.errorReportCsv) return;
    const blob = new Blob([preview.errorReportCsv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${preview.entity}-import-errors.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke on the next tick so browsers can start the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="mt-6 space-y-6">
      <form
        action={formAction}
        className="space-y-5 rounded-lg border border-border bg-surface-raised p-5"
      >
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Preview a CSV import
          </h2>
          <p className="mt-1 text-sm text-muted">
            Validation happens on the server against the same rules as the
            editors. This step writes nothing — no record is created or changed.
          </p>
        </div>

        {state.error ? (
          <div
            role="alert"
            className="rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground"
          >
            {state.error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Record type</span>
            <select
              name="entity"
              defaultValue="heroes"
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {IMPORT_ENTITIES.map((entity) => (
                <option key={entity} value={entity}>
                  {entity === "heroes" ? "Heroes" : "Skins"}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">CSV file</span>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm file:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
        </div>

        <div className="text-xs text-muted">
          <p>UTF-8 CSV, up to 2 MiB and 1,000 data rows. Header order does not matter.</p>
          <p className="mt-2">
            <span className="font-medium text-foreground">Heroes:</span>{" "}
            {CSV_COLUMNS_BY_ENTITY.heroes.join(", ")}
          </p>
          <p className="mt-1">
            <span className="font-medium text-foreground">Skins:</span>{" "}
            {CSV_COLUMNS_BY_ENTITY.skins.join(", ")}
          </p>
          <p className="mt-2">
            Skin references use the hero slug. Media references must be UUIDs;
            existence is re-checked when an import is committed.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Validating…" : "Preview import"}
        </button>
      </form>

      {preview ? (
        <PreviewPanel
          entity={preview.entity}
          preview={preview}
          onDownload={downloadErrorReport}
        />
      ) : null}
    </div>
  );
}

interface PreviewPanelProps {
  entity: ImportEntity;
  preview: NonNullable<CsvImportState["preview"]>;
  onDownload: () => void;
}

function PreviewPanel({ entity, preview, onDownload }: PreviewPanelProps) {
  const validCount = preview.newRows.length + preview.existingRows.length;

  return (
    <section
      aria-label="Import preview"
      className="space-y-6 rounded-lg border border-border p-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {entity === "heroes" ? "Heroes" : "Skins"} preview
        </h2>
        <p className="mt-1 text-sm text-muted">
          Nothing has been written. Rows marked “existing” will need the merge
          workflow (task 03-04) before they can change stored data.
        </p>
      </div>

      <dl
        role="status"
        className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"
      >
        <Stat label="Data rows" value={preview.totalRows} />
        <Stat label="Valid" value={validCount} />
        <Stat label="New" value={preview.newRows.length} />
        <Stat label="Existing" value={preview.existingRows.length} />
        <Stat label="With errors" value={preview.errors.length} />
      </dl>

      {preview.errors.length > 0 ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Row errors
            </h3>
            {preview.errorReportCsv ? (
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Download error report
              </button>
            ) : null}
          </div>
          <div className="mt-3 overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Rows rejected by validation, with their field errors
              </caption>
              <thead className="bg-surface-raised text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Row</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Slug</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Problems</th>
                </tr>
              </thead>
              <tbody>
                {preview.errors
                  .slice(0, MAX_ERRORS_SHOWN)
                  .map((error) => (
                    <tr key={error.row} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-muted">{error.row}</td>
                      <td className="px-3 py-2 text-foreground">
                        {error.slug ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <ul className="space-y-1">
                          {error.issues.map((issue, index) => (
                            <li key={`${issue.path}-${index}`} className="text-muted">
                              <code className="text-foreground">{issue.path}</code>
                              {": "}
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {preview.errors.length > MAX_ERRORS_SHOWN ? (
            <p className="mt-2 text-xs text-muted">
              Showing the first {MAX_ERRORS_SHOWN} of {preview.errors.length}{" "}
              rows. Download the error report for the complete list.
            </p>
          ) : null}
        </div>
      ) : null}

      <RowTable
        title="New rows"
        emptyMessage="No valid rows would be created."
        rows={preview.newRows}
      />
      <RowTable
        title="Existing-row candidates"
        emptyMessage="No rows match an existing slug."
        rows={preview.existingRows}
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-foreground">{value}</dd>
    </div>
  );
}

interface RowTableProps {
  title: string;
  emptyMessage: string;
  rows: NonNullable<CsvImportState["preview"]>["newRows"];
}

function RowTable({ title, emptyMessage, rows }: RowTableProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{emptyMessage}</p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="bg-surface-raised text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Row</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Slug</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, MAX_ROWS_SHOWN).map((row) => (
                  <tr key={row.row} className="border-t border-border">
                    <td className="px-3 py-2 text-muted">{row.row}</td>
                    <td className="px-3 py-2 text-foreground">{row.slug}</td>
                    <td className="px-3 py-2 text-foreground">{row.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > MAX_ROWS_SHOWN ? (
            <p className="mt-2 text-xs text-muted">
              Showing the first {MAX_ROWS_SHOWN} of {rows.length} rows.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
