/**
 * Upload admission checks for the CSV dry-run import (task 03-03).
 *
 * The browser-provided file name, MIME type and size are all untrusted. These
 * helpers apply the cheap checks first (so an oversized or obviously binary
 * upload never reaches the parser), then decode strictly as UTF-8. There is no
 * fallback to a permissive encoding: a Windows-1252 CSV is rejected with a
 * caller-safe message instead of being silently mangled.
 *
 * Pure and dependency-free, so it can be unit-tested without a DOM or Node
 * `File` global.
 */

/** 2 MiB is far more than a personal collection needs and bounds memory use. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

/** Data rows accepted per preview, excluding the header row. */
export const MAX_CSV_ROWS = 1000;

/** Columns accepted per record. Both schemas use 11. */
export const MAX_CSV_COLUMNS = 40;

const CSV_EXTENSION = ".csv";

const ACCEPTED_MIME_TYPES = new Set([
  "",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
]);

export interface CsvFileMeta {
  name: string;
  type: string;
  size: number;
}

export type DecodedCsv =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Validates the file's declared metadata. Returns a caller-safe message, or
 * `null` when the file may be read. Content is checked separately by
 * {@link decodeCsvBytes}: a file can claim to be CSV and still be binary.
 */
export function validateCsvFileMeta(meta: CsvFileMeta): string | null {
  if (meta.size <= 0) {
    return "The selected file is empty.";
  }
  if (meta.size > MAX_CSV_BYTES) {
    return `The CSV must be ${formatMiB(MAX_CSV_BYTES)} or smaller.`;
  }

  const name = meta.name.trim().toLowerCase();
  const type = meta.type.trim().toLowerCase();
  const hasCsvName = name.endsWith(CSV_EXTENSION);

  // Some browsers report an empty type for `.csv`; accept the extension instead.
  // If a MIME type *is* provided and is not CSV-ish, only a `.csv` name keeps it
  // in the running. The byte-level checks below still have the final say.
  if (!hasCsvName && !ACCEPTED_MIME_TYPES.has(type)) {
    return "Choose a .csv file.";
  }

  return null;
}

/**
 * Decodes raw upload bytes as strict UTF-8 and strips a leading BOM. Rejects
 * NUL bytes (a reliable binary signal), invalid UTF-8 and oversized payloads.
 */
export function decodeCsvBytes(bytes: Uint8Array): DecodedCsv {
  if (bytes.byteLength === 0) {
    return { ok: false, error: "The selected file is empty." };
  }
  if (bytes.byteLength > MAX_CSV_BYTES) {
    return {
      ok: false,
      error: `The CSV must be ${formatMiB(MAX_CSV_BYTES)} or smaller.`,
    };
  }
  if (bytes.includes(0)) {
    return { ok: false, error: "The selected file is not a text CSV." };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      error: "The CSV must be UTF-8 encoded. Re-save it as UTF-8 and try again.",
    };
  }

  // Strip exactly one BOM; the parser also tolerates one, but decoding here
  // means every caller sees clean text.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  if (text.trim().length === 0) {
    return { ok: false, error: "The selected file is empty." };
  }

  return { ok: true, text };
}

function formatMiB(bytes: number): string {
  return `${bytes / (1024 * 1024)} MiB`;
}
