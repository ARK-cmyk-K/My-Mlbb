/**
 * Safe CSV output for the dry-run import preview (task 03-03).
 *
 * CSV cells are untrusted: a slug or milestone such as `=HYPERLINK(...)` would
 * be executed as a formula if the exported error report were opened in a
 * spreadsheet. Every exported cell therefore goes through
 * {@link neutralizeSpreadsheetFormula}, which prefixes formula-triggering values
 * with an apostrophe (the spreadsheet convention for "treat as text"), then
 * through RFC 4180 quoting.
 *
 * The dashboard itself renders values as React text, which already escapes
 * HTML. This module only covers the downloadable report.
 */

import type { ImportRowError } from "./preview.ts";

/** Excel/LibreOffice treat a cell starting with these characters as a formula. */
const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

/** Prefixes a formula-looking value with `'` so spreadsheets keep it as text. */
export function neutralizeSpreadsheetFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

/** Neutralizes then quotes one CSV cell. */
export function escapeSpreadsheetCell(
  value: string | number | null | undefined
): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = neutralizeSpreadsheetFormula(text);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Serializes a header and rows to CRLF-terminated CSV. */
export function buildCsvReport(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>
): string {
  const lines = [header.map(escapeSpreadsheetCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeSpreadsheetCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Flat, formula-neutralized error report: one line per field issue. Returns an
 * empty string when there is nothing to report.
 */
export function buildImportErrorReport(
  errors: readonly ImportRowError[]
): string {
  const rows = errors.flatMap((error) =>
    error.issues.map((issue) => [
      error.row,
      error.slug ?? "",
      issue.path,
      issue.message,
    ])
  );
  if (rows.length === 0) return "";
  return buildCsvReport(["row", "slug", "field", "message"], rows);
}
