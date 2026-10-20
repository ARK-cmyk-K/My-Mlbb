"use server";

import { contentService } from "../lib/content";
import { isContentServiceError } from "../lib/content/errors.ts";
import {
  parseCsv,
} from "../lib/import/csv.ts";
import {
  isImportEntity,
  type ImportEntity,
} from "../lib/import/columns.ts";
import {
  buildMergePreview,
  type MergeReferences,
} from "../lib/import/merge.ts";
import { commitMergePreview } from "../lib/import/merge-commit.ts";
import { mergePreviewStore } from "../lib/import/preview-store.ts";
import { buildImportErrorReport } from "../lib/import/spreadsheet.ts";
import {
  decodeCsvBytes,
  MAX_CSV_COLUMNS,
  MAX_CSV_ROWS,
  validateCsvFileMeta,
} from "../lib/import/upload.ts";
import type { FieldIssue } from "../lib/content/validation.ts";

export type { MergeRowOutcome, MergeCommitSummary } from "../lib/import/merge-commit.ts";
export type {
  MergeFieldDiff,
  MergePreviewPayload,
  MergePreviewRow,
  MergeRowResolution,
  MergeValue,
} from "../lib/import/merge.ts";

/** Serializable result of the import/merge workflow (task 03-04). */
export interface CsvImportState {
  error?: string;
  issues?: FieldIssue[];
  preview?: MergePreviewView;
  result?: import("../lib/import/merge-commit.ts").MergeCommitSummary;
}

export interface MergePreviewView {
  previewId: string;
  entity: ImportEntity;
  totalRows: number;
  newRows: Array<{ row: number; slug: string; name: string }>;
  existingRows: Array<{
    row: number;
    slug: string;
    name: string;
    diffs: Array<{
      field: string;
      label: string;
      existing: import("../lib/import/merge.ts").MergeValue;
      imported: import("../lib/import/merge.ts").MergeValue;
    }>;
  }>;
  errors: import("../lib/import/preview.ts").ImportRowError[];
  errorReportCsv?: string;
}

/**
 * Merge preview (task 03-04).
 *
 * Uploads the file, validates it, computes field-by-field diffs for existing
 * rows, stores the canonical preview on the server and returns a preview id
 * together with the reviewable diff. The client only ever sends choices back
 * to {@link commitCsvImportAction}; the server re-validates and re-reads the
 * current draft state before applying anything. Nothing is written here.
 */
export async function previewCsvImportAction(
  _prevState: CsvImportState,
  formData: FormData
): Promise<CsvImportState> {
  const entity = formData.get("entity");
  if (!isImportEntity(entity)) {
    return { error: "Choose heroes or skins before uploading a CSV." };
  }

  const file = formData.get("file");
  if (file === null || typeof file === "string") {
    return { error: "Choose a CSV file to preview." };
  }

  const metaError = validateCsvFileMeta({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (metaError !== null) {
    return { error: metaError };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { error: "The selected file could not be read." };
  }

  const decoded = decodeCsvBytes(bytes);
  if (!decoded.ok) {
    return { error: decoded.error };
  }

  const parsed = parseCsv(decoded.text, {
    maxRecords: MAX_CSV_ROWS + 1,
    maxColumns: MAX_CSV_COLUMNS,
  });
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  try {
    const references = await loadMergeReferences(entity);
    const result = buildMergePreview(entity, parsed.records, references);
    if (!result.ok) {
      return { error: result.error };
    }

    const previewId = mergePreviewStore.put(result.payload);
    const preview = result.payload;
    const view = toView(previewId, preview);

    return {
      preview: {
        ...view,
        errorReportCsv:
          preview.errors.length > 0
            ? buildImportErrorReport(preview.errors)
            : undefined,
      },
    };
  } catch (error) {
    if (isContentServiceError(error)) {
      return { error: error.message };
    }
    return {
      error: "The preview could not be generated. Please try again.",
    };
  }
}

/**
 * Commits the operator's resolved choices (task 03-04).
 *
 * The preview id binds this request to a server-generated preview. The
 * implementation re-reads the draft tables, checks for stale/conflicting
 * edits, re-validates every merged payload and applies changes only to drafts
 * in a controlled operation with compensation on failure.
 */
export async function commitCsvImportAction(
  _prevState: CsvImportState,
  formData: FormData
): Promise<CsvImportState> {
  const previewId = formData.get("previewId");
  if (typeof previewId !== "string" || previewId.length === 0) {
    return { error: "This preview is no longer available. Run the import preview again." };
  }

  const resolutionsRaw = formData.get("resolutions");
  if (typeof resolutionsRaw !== "string") {
    return { error: "No choices were submitted." };
  }

  let resolutions: unknown;
  try {
    resolutions = JSON.parse(resolutionsRaw);
  } catch {
    return { error: "The submitted choices are not valid." };
  }

  try {
    const result = await commitMergePreview(
      { service: contentService, store: mergePreviewStore },
      { previewId, resolutions }
    );
    if (!result.ok) {
      return { error: result.error, issues: result.issues, result: result.summary };
    }
    return { result: result.summary };
  } catch (error) {
    if (isContentServiceError(error)) {
      return { error: error.message };
    }
    return {
      error: "The merge could not be completed. Please try again.",
    };
  }
}

async function loadMergeReferences(entity: ImportEntity): Promise<MergeReferences> {
  const [heroes, skins] = await Promise.all([
    contentService.listDraftHeroes({ includeArchived: true }),
    contentService.listDraftSkins({ includeArchived: true }),
  ]);
  return { existingSlugs: [], heroes, skins };
}

function toView(previewId: string, payload: import("../lib/import/merge.ts").MergePreviewPayload): MergePreviewView {
  return {
    previewId,
    entity: payload.entity,
    totalRows: payload.totalRows,
    newRows: payload.rows
      .filter((row) => row.action === "new")
      .map((row) => ({ row: row.row, slug: row.slug, name: row.name })),
    existingRows: payload.rows
      .filter((row) => row.action === "existing")
      .map((row) => ({
        row: row.row,
        slug: row.slug,
        name: row.name,
        diffs: row.diffs
          .filter((diff) => diff.differs)
          .map((diff) => ({
            field: diff.field,
            label: diff.label,
            existing: diff.existing,
            imported: diff.imported,
          })),
      })),
    errors: payload.errors,
  };
}

// Keep the legacy type in scope for any tooling that imports it.
export type { CsvImportState as CsvImportStateLegacy } from "../lib/import/preview.ts";
