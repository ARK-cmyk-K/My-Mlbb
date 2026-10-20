"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  commitCsvImportAction,
  previewCsvImportAction,
  type CsvImportState,
  type MergeCommitSummary,
  type MergeRowResolution,
} from "../../actions/import-actions";
import {
  CSV_COLUMNS_BY_ENTITY,
  IMPORT_ENTITIES,
  type ImportEntity,
} from "../../lib/import/columns";
import type { FieldIssue } from "../../lib/content/validation.ts";

const INITIAL_STATE: CsvImportState = {};

const MAX_ROWS_SHOWN = 50;
const MAX_ERRORS_SHOWN = 100;

const FORM_STEP = {
  upload: "upload",
  resolve: "resolve",
  result: "result",
} as const;
type FormStep = (typeof FORM_STEP)[keyof typeof FORM_STEP];

/**
 * CSV merge workflow form (task 03-04).
 *
 * Step 1: upload → preview action computes field-by-field diffs for existing
 * rows, stores the canonical preview server-side and returns a `previewId`.
 * Step 2: operator resolves conflicts (keep/use per differing field, include/
 * skip rows) → commit action re-validates against current state with
 * compensation on failure.
 * Step 3: summary with per-row outcomes and errors.
 */
export function CsvImportForm() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewCsvImportAction,
    INITIAL_STATE
  );
  const [commitState, commitAction, commitPending] = useActionState(
    commitCsvImportAction,
    INITIAL_STATE
  );

  const preview = previewState.preview;
  const result = commitState.result;

  const step: FormStep = useMemo(() => {
    if (result) return FORM_STEP.result;
    if (preview) return FORM_STEP.resolve;
    return FORM_STEP.upload;
  }, [preview, result]);

  const [resolutions, setResolutions] = useState<MergeRowResolution[]>([]);

  useEffect(() => {
    if (preview && resolutions.length === 0) {
      setResolutions(buildDefaults(preview));
    }
  }, [preview, resolutions.length]);

  useEffect(() => {
    if (result) {
      setResolutions([]);
    }
  }, [result]);

  const downloadErrorReport = (): void => {
    const report =
      result?.errorReportCsv ??
      preview?.errorReportCsv;
    if (!report) return;
    const blob = new Blob([report], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result?.errorReportCsv
      ? `${preview?.entity ?? "import"}-commit-errors.csv`
      : `${preview?.entity ?? "import"}-import-errors.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const errorMessage =
    commitState.error ?? previewState.error;
  const issues = commitState.issues ?? [];

  return (
    <div className="mt-6 space-y-6">
      {step === FORM_STEP.upload ? (
        <UploadForm
          formAction={previewAction}
          pending={previewPending}
          error={errorMessage}
          issues={issues}
        />
      ) : null}

      {step === FORM_STEP.resolve && preview ? (
        <ResolveForm
          preview={preview}
          resolutions={resolutions}
          setResolutions={setResolutions}
          formAction={commitAction}
          pending={commitPending}
          error={errorMessage}
          issues={issues}
          onDownload={downloadErrorReport}
        />
      ) : null}

      {step === FORM_STEP.result && result ? (
        <ResultPanel
          summary={result}
          previewEntity={preview?.entity}
          onDownload={downloadErrorReport}
          onStartOver={() => {
            window.location.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function buildDefaults(preview: NonNullable<CsvImportState["preview"]>): MergeRowResolution[] {
  const rows: MergeRowResolution[] = [];

  for (const row of preview.newRows) {
    rows.push({ row: row.row, action: "include", fields: {} });
  }
  for (const row of preview.existingRows) {
    rows.push({
      row: row.row,
      action: "include",
      fields: Object.fromEntries(row.diffs.map((diff) => [diff.field, "keep"] as const)),
    });
  }
  return rows.sort((a, b) => a.row - b.row);
}

interface UploadFormProps {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  issues: FieldIssue[];
}

function UploadForm({ formAction, pending, error, issues }: UploadFormProps) {
  return (
    <form
      action={formAction}
      className="space-y-5 rounded-lg border border-border bg-surface-raised p-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Preview a CSV import
        </h2>
        <p className="mt-1 text-sm text-muted">
          Validation and diffing run on the server. New rows are listed as
          creations; existing rows show field-by-field differences. Nothing is
          written at this step.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground"
        >
          {error}
          {issues.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
              {issues.slice(0, MAX_ERRORS_SHOWN).map((issue, index) => (
                <li key={`${issue.path}-${index}`}>
                  <code className="text-foreground">{issue.path}</code>
                  {": "}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
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
          existence is re-checked at commit time.
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
  );
}

interface ResolveFormProps {
  preview: NonNullable<CsvImportState["preview"]>;
  resolutions: MergeRowResolution[];
  setResolutions: (resolutions: MergeRowResolution[]) => void;
  formAction: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  issues: FieldIssue[];
  onDownload: () => void;
}

function ResolveForm({
  preview,
  resolutions,
  setResolutions,
  formAction,
  pending,
  error,
  issues,
  onDownload,
}: ResolveFormProps) {
  const validCount = preview.newRows.length + preview.existingRows.length;
  const resolutionMap = useMemo(
    () => new Map(resolutions.map((r) => [r.row, r])),
    [resolutions]
  );

  const updateResolution = (row: MergeRowResolution): void => {
    const next = [...resolutions];
    const idx = next.findIndex((r) => r.row === row.row);
    if (idx === -1) {
      next.push(row);
      next.sort((a, b) => a.row - b.row);
      setResolutions(next);
      return;
    }
    next[idx] = row;
    setResolutions(next);
  };

  const newRows = preview.newRows.slice(0, MAX_ROWS_SHOWN);
  const moreNew = preview.newRows.length > MAX_ROWS_SHOWN;
  const diffRows = preview.existingRows.slice(0, 25);
  const moreDiff = preview.existingRows.length > 25;

  return (
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground"
        >
          {error}
          {issues.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
              {issues.slice(0, MAX_ERRORS_SHOWN).map((issue, index) => (
                <li key={`${issue.path}-${index}`}>
                  <code className="text-foreground">{issue.path}</code>
                  {": "}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-6 rounded-lg border border-border p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {preview.entity === "heroes" ? "Heroes" : "Skins"} — resolve conflicts
          </h2>
          <p className="mt-1 text-sm text-muted">
            For each existing row, choose <strong>keep existing</strong> or{" "}
            <strong>use imported value</strong> per differing field. For new rows,
            include or skip. Rows not shown use the defaults (include, keep all).
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
                Row errors (not included in commit)
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
                <thead className="bg-surface-raised text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Row</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Slug</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Problems</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.errors.slice(0, MAX_ERRORS_SHOWN).map((error) => (
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
          </div>
        ) : null}

        <div>
          <h3 className="text-sm font-semibold text-foreground">New entries</h3>
          {preview.newRows.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None</p>
          ) : (
            <div className="mt-3 space-y-2">
              {newRows.map((row) => {
                const res = resolutionMap.get(row.row) ?? {
                  row: row.row,
                  action: "include" as const,
                  fields: {},
                };
                return (
                  <div
                    key={row.row}
                    className="rounded-md border border-border bg-surface-raised p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Row {row.row} — {row.name}
                        </p>
                        <p className="text-xs text-muted">Slug: {row.slug}</p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={res.action === "include"}
                            onChange={() =>
                              updateResolution({ ...res, action: "include" })
                            }
                          />
                          <span>Include</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={res.action === "skip"}
                            onChange={() =>
                              updateResolution({ ...res, action: "skip" })
                            }
                          />
                          <span>Skip</span>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
              {moreNew && (
                <p className="text-xs text-muted">
                  Showing first {MAX_ROWS_SHOWN} of {preview.newRows.length} new rows;
                  remaining use defaults (include).
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Existing entries with differences
          </h3>
          {preview.existingRows.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None</p>
          ) : (
            <div className="mt-3 space-y-4">
              {diffRows.map((row) => {
                const res = resolutionMap.get(row.row) ?? {
                  row: row.row,
                  action: "include" as const,
                  fields: {},
                };
                return (
                  <div
                    key={row.row}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Row {row.row} — {row.name}
                        </p>
                        <p className="text-xs text-muted">Slug: {row.slug}</p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={res.action === "include"}
                            onChange={() =>
                              updateResolution({ ...res, action: "include" })
                            }
                          />
                          <span>Include</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={res.action === "skip"}
                            onChange={() =>
                              updateResolution({ ...res, action: "skip" })
                            }
                          />
                          <span>Skip</span>
                        </label>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead className="bg-surface-raised text-muted">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Field</th>
                            <th className="px-3 py-2 font-semibold">Existing</th>
                            <th className="px-3 py-2 font-semibold">Imported</th>
                            <th className="px-3 py-2 font-semibold">Choice</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.diffs.map((diff) => {
                            const choice = res.fields[diff.field] ?? "keep";
                            return (
                              <tr key={diff.field} className="border-t border-border align-top">
                                <td className="px-3 py-2 text-foreground">
                                  {diff.label}
                                  <code className="ml-2 text-muted">{diff.field}</code>
                                </td>
                                <td className="px-3 py-2 text-muted">
                                  {formatValue(diff.existing)}
                                </td>
                                <td className="px-3 py-2 text-foreground">
                                  {formatValue(diff.imported)}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        checked={choice === "keep"}
                                        onChange={() =>
                                          updateResolution({
                                            ...res,
                                            fields: { ...res.fields, [diff.field]: "keep" },
                                          })
                                        }
                                      />
                                      <span>Keep existing</span>
                                    </label>
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        checked={choice === "use"}
                                        onChange={() =>
                                          updateResolution({
                                            ...res,
                                            fields: { ...res.fields, [diff.field]: "use" },
                                          })
                                        }
                                      />
                                      <span>Use imported</span>
                                    </label>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              {moreDiff && (
                <p className="text-xs text-muted">
                  Showing first 25 of {preview.existingRows.length} rows with
                  differences; remaining use defaults (include, keep all).
                </p>
              )}
            </div>
          )}
        </div>

        <form action={formAction} className="pt-4">
          <input type="hidden" name="previewId" value={preview.previewId} />
          <input
            type="hidden"
            name="resolutions"
            value={JSON.stringify(resolutions)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              The commit re-validates against current draft data and refuses to
              apply if anything changed since this preview.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Committing…" : "Commit selected changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(blank)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-foreground">{value}</dd>
    </div>
  );
}

interface ResultPanelProps {
  summary: MergeCommitSummary;
  previewEntity?: ImportEntity;
  onDownload: () => void;
  onStartOver: () => void;
}

function ResultPanel({
  summary,
  previewEntity,
  onDownload,
  onStartOver,
}: ResultPanelProps) {
  const entity = previewEntity ?? summary.entity;
  const hasErrors = summary.failed > 0 || summary.errorReportCsv !== undefined;
  const hasChanges =
    summary.created > 0 || summary.updated > 0 || summary.unchanged > 0 || summary.skipped > 0;

  return (
    <section className="space-y-6 rounded-lg border border-border p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {entity === "heroes" ? "Heroes" : "Skins"} — commit complete
        </h2>
        <p className="mt-1 text-sm text-muted">
          The operation did not partially commit silently. Check the per-row
          outcomes below.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Total rows" value={summary.total} />
        <Stat label="Created" value={summary.created} />
        <Stat label="Updated" value={summary.updated} />
        <Stat label="Unchanged" value={summary.unchanged} />
        <Stat label="Skipped" value={summary.skipped} />
        <Stat label="Failed" value={summary.failed} />
        <Stat label="Rolled back" value={summary.rolledBack ? 1 : 0} />
      </dl>

      {summary.rolledBack ? (
        <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground">
          A failure occurred during application. Applied changes were rolled
          back to their previous state where possible.
        </div>
      ) : null}

      {summary.failed > 0 && summary.errorReportCsv ? (
        <div className="flex flex-wrap items-center justify-end">
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Download commit error report
          </button>
        </div>
      ) : null}

      {hasChanges ? (
        <div>
          <h3 className="text-sm font-semibold text-foreground">Row outcomes</h3>
          <div className="mt-3 overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface-raised text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Slug</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Error</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={`${row.row}-${row.slug}-${row.status}`} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-muted">{row.row}</td>
                    <td className="px-3 py-2 text-foreground">{row.slug}</td>
                    <td className="px-3 py-2 text-foreground">{row.status}</td>
                    <td className="px-3 py-2 text-muted">{row.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {hasErrors ? null : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onStartOver}
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Start a new import
          </button>
        </div>
      )}
    </section>
  );
}
