"use server";

import { createBackupExport, type BackupOptions, type BackupExport } from "../lib/export/backup.ts";
import { ContentServiceError, isContentServiceError } from "../lib/content/errors.ts";

export type ExportBackupState = {
  error?: string;
  export?: BackupExport;
};

export async function exportBackupAction(
  _prevState: ExportBackupState,
  formData: FormData
): Promise<ExportBackupState> {
  const scopeRaw = formData.get("scope");
  const scope =
    scopeRaw === "draft" || scopeRaw === "published" || scopeRaw === "everything" || scopeRaw === "working-set"
      ? scopeRaw
      : "everything";

  const includePublicUrls = formData.get("includePublicUrls") === "on";

  try {
    const result = await createBackupExport({ scope, includePublicUrls });
    return { export: result };
  } catch (error) {
    if (isContentServiceError(error)) {
      return { error: error.message };
    }
    return {
      error: "The backup export could not be generated. Please try again.",
    };
  }
}
