/**
 * CSV dry-run preview builder (task 03-03).
 *
 * This module turns parsed CSV records into a structured preview and **never
 * writes anything**. It reuses the `02-03`/`03-01`/`03-02` hero and skin
 * validators, so a row that would be rejected by the dashboard editor is
 * rejected here for exactly the same reason.
 *
 * Reference checks that need the database are passed in by the caller as
 * read-only snapshots (`ImportReferences`), keeping this module pure:
 *   - `existingSlugs` classifies rows as `new` or `existing` (a merge candidate
 *     for task 03-04 — this task does not merge);
 *   - `heroes` resolves the skin `hero_slug` column, because operators should
 *     not have to paste UUIDs.
 *
 * Media references are checked for UUID shape only. Whether the media row
 * actually exists is enforced by the database foreign key when a later task
 * commits the import, so the preview says "shape is valid" and never claims the
 * file exists.
 */

import type { FieldIssue } from "../content/validation.ts";
import { validateHeroInput, validateSkinInput } from "../content/validation.ts";
import { isUuid } from "../content/form-utils.ts";
import {
  CSV_COLUMNS_BY_ENTITY,
  type ImportEntity,
} from "./columns.ts";

export interface ImportReferences {
  /** Slugs already stored for the entity being imported. */
  existingSlugs: readonly string[];
  /** Existing heroes, used to resolve skin `hero_slug` references. */
  heroes: ReadonlyArray<{ id: string; slug: string }>;
}

export interface ImportPreviewRow {
  /** Spreadsheet-style row number: the header is row 1. */
  row: number;
  slug: string;
  name: string;
  action: "new" | "existing";
}

export interface ImportRowError {
  row: number;
  slug: string | null;
  issues: FieldIssue[];
}

export interface ImportPreview {
  entity: ImportEntity;
  /** Non-blank data rows (the header is excluded). */
  totalRows: number;
  newRows: ImportPreviewRow[];
  /** Rows whose slug already exists; merge resolution is task 03-04. */
  existingRows: ImportPreviewRow[];
  errors: ImportRowError[];
  /** Formula-neutralized CSV report, present only when there are errors. */
  errorReportCsv?: string;
}

export type ImportPreviewResult =
  | { ok: true; preview: ImportPreview }
  | { ok: false; error: string };

/** Serializable result of the preview Server Action. */
export interface CsvImportState {
  error?: string;
  preview?: ImportPreview;
}

const HERO_ISSUE_COLUMN: Record<string, string> = {
  name: "name",
  slug: "slug",
  primaryRole: "primary_role",
  secondaryRole: "secondary_role",
  specialty: "specialty",
  portraitMediaId: "portrait_media_id",
  masteryLevel: "mastery_level",
  totalMatches: "total_matches",
  winRate: "win_rate",
  isSignature: "is_signature",
  isFavorite: "is_favorite",
};

const SKIN_ISSUE_COLUMN: Record<string, string> = {
  name: "name",
  slug: "slug",
  heroId: "hero_slug",
  rarity: "rarity",
  series: "series",
  splashArtMediaId: "splash_art_media_id",
  variant: "variant",
  acquisitionDate: "acquisition_date",
  acquisitionMilestone: "acquisition_milestone",
  isOwned: "is_owned",
  isFavorite: "is_favorite",
};

/**
 * Validates the header row and builds the preview.
 *
 * `records` includes the header as `records[0]`; the parser has already
 * enforced row/column limits. Blank trailing rows are ignored.
 */
export function buildImportPreview(
  entity: ImportEntity,
  records: readonly (readonly string[])[],
  references: ImportReferences
): ImportPreviewResult {
  if (records.length === 0) {
    return { ok: false, error: "The CSV is empty. Add a header row and data rows." };
  }

  const header = readHeader(entity, records[0] ?? []);
  if (!header.ok) return header;

  const column = header.column;
  const existingSlugs = new Set(references.existingSlugs);
  const heroBySlug = new Map(
    references.heroes.map((hero) => [hero.slug.toLowerCase(), hero])
  );
  const seenSlugs = new Map<string, number>();

  const newRows: ImportPreviewRow[] = [];
  const existingRows: ImportPreviewRow[] = [];
  const errors: ImportRowError[] = [];
  let totalRows = 0;

  for (let index = 1; index < records.length; index += 1) {
    const record = records[index];
    const row = index + 1;

    if (record.every((cell) => cell.trim() === "")) {
      continue;
    }
    totalRows += 1;

    const name = cell(record, column, "name");
    const slug = cell(record, column, "slug");
    const issues: FieldIssue[] = [];

    if (slug.length > 0) {
      const firstRow = seenSlugs.get(slug);
      if (firstRow === undefined) {
        seenSlugs.set(slug, row);
      } else {
        issues.push({
          path: "slug",
          message: `duplicate slug in this file (first used on row ${firstRow})`,
        });
      }
    }

    if (entity === "heroes") {
      collectHeroIssues(record, column, issues);
    } else {
      collectSkinIssues(record, column, heroBySlug, issues);
    }

    if (issues.length > 0) {
      errors.push({ row, slug: slug.length > 0 ? slug : null, issues });
      continue;
    }

    const previewRow: ImportPreviewRow = {
      row,
      slug,
      name,
      action: existingSlugs.has(slug) ? "existing" : "new",
    };
    if (previewRow.action === "existing") {
      existingRows.push(previewRow);
    } else {
      newRows.push(previewRow);
    }
  }

  return {
    ok: true,
    preview: { entity, totalRows, newRows, existingRows, errors },
  };
}

// ---------------------------------------------------------------------------
// Header handling
// ---------------------------------------------------------------------------

type HeaderResult =
  | { ok: true; column: Map<string, number> }
  | { ok: false; error: string };

function readHeader(
  entity: ImportEntity,
  rawHeader: readonly string[]
): HeaderResult {
  const expected = CSV_COLUMNS_BY_ENTITY[entity];
  const column = new Map<string, number>();
  const duplicates: string[] = [];
  const unexpected: string[] = [];

  rawHeader.forEach((raw, index) => {
    const header = normalizeHeader(raw);
    if (header === "") {
      unexpected.push(`(empty column ${index + 1})`);
      return;
    }
    if (column.has(header)) {
      if (!duplicates.includes(header)) duplicates.push(header);
      return;
    }
    column.set(header, index);
    if (!expected.includes(header)) unexpected.push(header);
  });

  const missing = expected.filter((header) => !column.has(header));

  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `The header row repeats ${formatList(duplicates)}. Each column may appear once.`,
    };
  }
  if (missing.length > 0 || unexpected.length > 0) {
    const parts = [
      missing.length > 0 ? `missing ${formatList(missing)}` : null,
      unexpected.length > 0 ? `unexpected ${formatList(unexpected)}` : null,
    ].filter((part): part is string => part !== null);
    return {
      ok: false,
      error: `The header row is invalid: ${parts.join("; ")}. Expected ${expected.join(", ")}.`,
    };
  }

  return { ok: true, column };
}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function formatList(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

function cell(
  record: readonly string[],
  column: Map<string, number>,
  header: string
): string {
  const index = column.get(header);
  return index === undefined ? "" : (record[index] ?? "").trim();
}

function collectHeroIssues(
  record: readonly string[],
  column: Map<string, number>,
  issues: FieldIssue[]
): void {
  const portraitMediaId = cell(record, column, "portrait_media_id");
  if (portraitMediaId.length > 0 && !isUuid(portraitMediaId)) {
    issues.push({
      path: "portrait_media_id",
      message: "must be a media UUID, or blank",
    });
  }

  const result = validateHeroInput({
    name: cell(record, column, "name"),
    slug: cell(record, column, "slug"),
    primaryRole: normalizeEnum(cell(record, column, "primary_role")),
    secondaryRole: normalizeEnum(cell(record, column, "secondary_role")),
    specialty: cell(record, column, "specialty"),
    portraitMediaId: portraitMediaId.length > 0 ? portraitMediaId : null,
    masteryLevel: parseNumber(cell(record, column, "mastery_level")),
    totalMatches: parseNumber(cell(record, column, "total_matches")),
    winRate: parseNumber(cell(record, column, "win_rate")),
    isSignature: parseBoolean(
      cell(record, column, "is_signature"),
      "is_signature",
      issues
    ),
    isFavorite: parseBoolean(
      cell(record, column, "is_favorite"),
      "is_favorite",
      issues
    ),
  });

  if (!result.ok) {
    pushMappedIssues(result.issues, HERO_ISSUE_COLUMN, issues);
  }
}

function collectSkinIssues(
  record: readonly string[],
  column: Map<string, number>,
  heroBySlug: Map<string, { id: string; slug: string }>,
  issues: FieldIssue[]
): void {
  const heroSlug = cell(record, column, "hero_slug").toLowerCase();
  let heroId: string | null = null;
  if (heroSlug.length > 0) {
    const hero = heroBySlug.get(heroSlug);
    if (hero === undefined) {
      issues.push({
        path: "hero_slug",
        message: "no existing hero has this slug",
      });
    } else {
      heroId = hero.id;
    }
  }

  const splashArtMediaId = cell(record, column, "splash_art_media_id");
  if (splashArtMediaId.length > 0 && !isUuid(splashArtMediaId)) {
    issues.push({
      path: "splash_art_media_id",
      message: "must be a media UUID, or blank",
    });
  }

  const result = validateSkinInput({
    name: cell(record, column, "name"),
    slug: cell(record, column, "slug"),
    heroId,
    rarity: normalizeEnum(cell(record, column, "rarity")),
    series: cell(record, column, "series"),
    splashArtMediaId:
      splashArtMediaId.length > 0 ? splashArtMediaId : null,
    variant: normalizeEnum(cell(record, column, "variant")),
    acquisitionDate: cell(record, column, "acquisition_date"),
    acquisitionMilestone: cell(record, column, "acquisition_milestone"),
    isOwned: parseBoolean(
      cell(record, column, "is_owned"),
      "is_owned",
      issues
    ),
    isFavorite: parseBoolean(
      cell(record, column, "is_favorite"),
      "is_favorite",
      issues
    ),
  });

  if (!result.ok) {
    pushMappedIssues(result.issues, SKIN_ISSUE_COLUMN, issues);
  }
}

function pushMappedIssues(
  source: readonly FieldIssue[],
  mapping: Record<string, string>,
  target: FieldIssue[]
): void {
  for (const issue of source) {
    target.push({
      path: mapping[issue.path] ?? issue.path,
      message: issue.message,
    });
  }
}

/** Empty stays `undefined` so the validator applies its own default. */
function parseNumber(raw: string): number | undefined {
  if (raw === "") return undefined;
  return Number(raw);
}

function normalizeEnum(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseBoolean(
  raw: string,
  path: string,
  issues: FieldIssue[]
): boolean {
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "false" || value === "no" || value === "0") {
    return false;
  }
  if (value === "true" || value === "yes" || value === "1") {
    return true;
  }
  issues.push({
    path,
    message: "must be true/false, yes/no or 1/0",
  });
  return false;
}
