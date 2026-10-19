/**
 * Minimal, strict RFC 4180 CSV parser (task 03-03).
 *
 * The import upload is untrusted input, so this parser is deliberately small,
 * total (never throws for malformed data) and bounded:
 *   - it handles quoted fields, escaped quotes (`""`), commas and CR/LF inside
 *     quotes, and strips a leading UTF-8 BOM;
 *   - it rejects an unterminated quote, a quote inside an unquoted field, and
 *     files that exceed the configured record/column limits;
 *   - it returns a caller-safe `error` string instead of a raw exception.
 *
 * It does not know about entities, headers or validation — that is `preview.ts`.
 */

export interface CsvParseOptions {
  /** Maximum records **including** the header row. Defaults to 1001. */
  maxRecords?: number;
  /** Maximum fields per record. Defaults to 40. */
  maxColumns?: number;
}

export type CsvParseResult =
  | { ok: true; records: string[][] }
  | { ok: false; error: string };

const QUOTE = '"';
const COMMA = ",";
const CR = "\r";
const LF = "\n";

/** Parses CSV text into records of fields. Never throws. */
export function parseCsv(
  input: string,
  options: CsvParseOptions = {}
): CsvParseResult {
  const maxRecords = options.maxRecords ?? 1001;
  const maxColumns = options.maxColumns ?? 40;

  // A BOM at the start of the file would otherwise become part of the first
  // header, so strip exactly one.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.length === 0) {
    return { ok: true, records: [] };
  }

  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let endedWithLineBreak = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === QUOTE) {
        if (text[i + 1] === QUOTE) {
          field += QUOTE;
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      endedWithLineBreak = false;
      i += 1;
      continue;
    }

    if (char === QUOTE) {
      if (field.length > 0) {
        return {
          ok: false,
          error: `Unexpected quote inside an unquoted field (record ${records.length + 1}).`,
        };
      }
      inQuotes = true;
      endedWithLineBreak = false;
      i += 1;
      continue;
    }

    if (char === COMMA) {
      if (record.length >= maxColumns) {
        return { ok: false, error: tooManyColumns(maxColumns) };
      }
      record.push(field);
      field = "";
      endedWithLineBreak = false;
      i += 1;
      continue;
    }

    if (char === CR || char === LF) {
      if (record.length >= maxColumns) {
        return { ok: false, error: tooManyColumns(maxColumns) };
      }
      record.push(field);
      field = "";
      records.push(record);
      record = [];
      if (records.length > maxRecords) {
        return { ok: false, error: tooManyRecords(maxRecords) };
      }
      if (char === CR && text[i + 1] === LF) {
        i += 2;
      } else {
        i += 1;
      }
      endedWithLineBreak = true;
      continue;
    }

    field += char;
    endedWithLineBreak = false;
    i += 1;
  }

  if (inQuotes) {
    return {
      ok: false,
      error: "Unterminated quoted field. Check that every opening quote is closed.",
    };
  }

  if (!endedWithLineBreak) {
    if (record.length >= maxColumns) {
      return { ok: false, error: tooManyColumns(maxColumns) };
    }
    record.push(field);
    records.push(record);
    if (records.length > maxRecords) {
      return { ok: false, error: tooManyRecords(maxRecords) };
    }
  }

  return { ok: true, records };
}

function tooManyColumns(maxColumns: number): string {
  return `The CSV has more than ${maxColumns} columns.`;
}

function tooManyRecords(maxRecords: number): string {
  return `The CSV has more than ${Math.max(0, maxRecords - 1)} data rows.`;
}
