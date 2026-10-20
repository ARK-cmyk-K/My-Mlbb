/**
 * View adapters for the merge workflow (task 03-04).
 *
 * The server-side `MergePreviewPayload` is canonical; the client receives a
 * serializable `MergePreviewView` that omits snapshot ids/updatedAt and flattens
 * differing fields into display strings.
 */

import type { MergeValue } from "./merge.ts";
import type { ImportEntity } from "./columns.ts";
import type { MergePreviewPayload } from "./merge.ts";
import type { ImportRowError } from "./preview.ts";

export interface MergePreviewViewDiff {
  field: string;
  label: string;
  existing: MergeValue;
  imported: MergeValue;
}

export interface MergePreviewViewExistingRow {
  row: number;
  slug: string;
  name: string;
  diffs: MergePreviewViewDiff[];
}

export interface MergePreviewView {
  previewId: string;
  entity: ImportEntity;
  totalRows: number;
  newRows: Array<{ row: number; slug: string; name: string }>;
  existingRows: MergePreviewViewExistingRow[];
  errors: ImportRowError[];
  errorReportCsv?: string;
}

/**
 * Converts the canonical server payload into a client-safe view and attaches
 * the server-generated preview id.
 */
export function toMergePreviewView(
  previewId: string,
  payload: MergePreviewPayload
): MergePreviewView {
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
