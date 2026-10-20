import type { DraftHomepageSection } from "./contracts.ts";
import { isContentServiceError } from "./errors.ts";
import { parseHomepageSectionsForm } from "./homepage-sections-form.ts";
import type { ContentService } from "./port.ts";
import type { FieldIssue } from "./validation.ts";

export interface HomepageSectionsActionState {
  error?: string;
  issues?: FieldIssue[];
}

export type HomepageSectionsMutationOutcome =
  | { ok: true; sections: DraftHomepageSection[] }
  | { ok: false; state: HomepageSectionsActionState };

const GENERIC_FAILURE = "Something went wrong. Please try again.";

function failure(error: string): HomepageSectionsMutationOutcome {
  return { ok: false, state: { error } };
}

function invalid(issues: FieldIssue[], error?: string): HomepageSectionsMutationOutcome {
  return { ok: false, state: error ? { error, issues } : { issues } };
}

function toActionState(error: unknown): HomepageSectionsActionState {
  if (isContentServiceError(error)) {
    return {
      error: error.message,
      issues: error.issues.length > 0 ? error.issues : undefined,
    };
  }
  return { error: GENERIC_FAILURE };
}

export function createHomepageSectionsAdminService(service: ContentService) {
  async function update(formData: FormData): Promise<HomepageSectionsMutationOutcome> {
    const parsed = parseHomepageSectionsForm(formData);
    if (!parsed.ok) {
      return invalid(parsed.issues, "Check the highlighted fields.");
    }
    try {
      return {
        ok: true,
        sections: await service.updateDraftHomepageSections(parsed.value),
      };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  async function get(): Promise<DraftHomepageSection[]> {
    return await service.listDraftHomepageSections();
  }

  return { update, get };
}

export type HomepageSectionsAdminService = ReturnType<typeof createHomepageSectionsAdminService>;
