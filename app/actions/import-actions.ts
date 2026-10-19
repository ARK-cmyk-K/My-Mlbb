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
  buildImportPreview,
  type CsvImportState,
} from "../lib/import/preview.ts";
import { buildImportErrorReport } from "../lib/import/spreadsheet.ts";
import {
  decodeCsvBytes,
  MAX_CSV_COLUMNS,
  MAX_CSV_ROWS,
  validateCsvFileMeta,
} from "../lib/import/upload.ts";

/**
 * CSV dry-run preview (task 03-03).
 *
 * Reads the uploaded file, validates it in memory and returns a structured
 * preview. **Nothing is written** — the only database access is two read-only
 * list calls used to classify rows and resolve hero slugs. Mutations belong to
 * the merge task (03-04), which will re-validate rather than trusting a preview.
 *
 * The action is reachable directly, so it does not rely on the page guard for
 * authorization: the content service authorizes every read (admin identity +
 * RLS) and returns a typed, caller-safe error otherwise.
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
    const references = await loadReferences(entity);
    const result = buildImportPreview(entity, parsed.records, references);
    if (!result.ok) {
      return { error: result.error };
    }

    const preview = result.preview;
    return {
      preview: {
        ...preview,
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

async function loadReferences(entity: ImportEntity) {
  const heroes = await contentService.listDraftHeroes({ includeArchived: true });
  const existing =
    entity === "heroes"
      ? heroes
      : await contentService.listDraftSkins({ includeArchived: true });

  return {
    existingSlugs: existing.map((record) => record.slug),
    heroes: heroes.map((hero) => ({ id: hero.id, slug: hero.slug })),
  };
}
