import { isContentServiceError } from "./errors.ts";
import { parseAppearanceForm } from "./appearance-form.ts";
import type { ContentService } from "./port.ts";
import type { FieldIssue } from "./validation.ts";
import type { DraftAppearanceSettings } from "./contracts.ts";

/**
 * Appearance settings orchestration (task 04-01).
 */

export interface AppearanceActionState {
  error?: string;
  issues?: FieldIssue[];
}

export type AppearanceMutationOutcome =
  | { ok: true; settings: DraftAppearanceSettings | null }
  | { ok: false; state: AppearanceActionState };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const MISSING_ID = "The appearance settings could not be identified.";

function failure(error: string): AppearanceMutationOutcome {
  return { ok: false, state: { error } };
}

function invalid(issues: FieldIssue[], error?: string): AppearanceMutationOutcome {
  return { ok: false, state: error ? { error, issues } : { issues } };
}

function toActionState(error: unknown): AppearanceActionState {
  if (isContentServiceError(error)) {
    return {
      error: error.message,
      issues: error.issues.length > 0 ? error.issues : undefined,
    };
  }
  return { error: GENERIC_FAILURE };
}

export function createAppearanceAdminService(service: ContentService) {
  async function update(formData: FormData): Promise<AppearanceMutationOutcome> {
    const parsed = parseAppearanceForm(formData);
    if (!parsed.ok) {
      return invalid(parsed.issues, "Check the highlighted fields.");
    }
    try {
      return {
        ok: true,
        settings: await service.updateDraftAppearanceSettings(parsed.value),
      };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  async function get(): Promise<DraftAppearanceSettings> {
    return await service.getDraftAppearanceSettings();
  }

  return { update, get };
}

export type AppearanceAdminService = ReturnType<typeof createAppearanceAdminService>;
