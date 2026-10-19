import type { DraftSkin, DraftTransition } from "./contracts.ts";
import { isContentServiceError } from "./errors.ts";
import type { ContentService } from "./port.ts";
import { parseSkinForm } from "./skin-form.ts";
import type { FieldIssue } from "./validation.ts";

/**
 * Skin management orchestration (task 03-02).
 *
 * The same boundary as `hero-admin.ts`: this is the piece between the Server
 * Actions and the content-service port, so the behaviour the dashboard relies on
 * — server-side validation, fail-closed authorization, and converting a thrown
 * `ContentServiceError` into a serializable, caller-safe state — is testable
 * without a database or a running server.
 *
 * The Server Action does the Next.js-only work (`revalidatePath`, `redirect`);
 * this module only parses input, calls the port and converts failures. It is
 * pure enough to run against `createInMemoryContentService` in the unit suite.
 *
 * Security:
 *   - Authorization is delegated to the port, which fails closed; this module
 *     never decides who is an admin and never reaches around the port.
 *   - Nothing but a `ContentServiceError`'s caller-safe message/issues leaves
 *     here. A raw failure becomes one generic message, so no SQL, table or stack
 *     detail can reach the browser.
 */

/** The `useActionState` payload a skin form renders (all values are safe). */
export interface SkinActionState {
  /** Caller-safe, non-field error message. Absent when the submission was clean. */
  error?: string;
  /** Field-level problems, rendered under the matching input. */
  issues?: FieldIssue[];
}

/** Result of one mutation, so the Server Action knows whether to redirect. */
export type SkinMutationOutcome =
  | { ok: true; skin: DraftSkin | null }
  | { ok: false; state: SkinActionState };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const MISSING_ID = "The selected skin could not be identified. Reload and retry.";

/**
 * `skins` has exactly two user-supplied foreign keys (`hero_id`,
 * `splash_art_media_id`), both `ON DELETE RESTRICT`. A missing target therefore
 * always means one of those two references — the schema decides which, and we
 * deliberately do not guess a field name here.
 */
const DEPENDENCY_FAILURE =
  "The selected hero or splash art does not exist. Choose existing records and retry.";

/** The lifecycle transitions the skin list/edit actions may request. */
export const SKIN_TRANSITIONS: readonly DraftTransition[] = [
  "publish",
  "unpublish",
  "archive",
  "restore",
] as const;

/** A state carrying only a non-field error. */
function failure(error: string): SkinMutationOutcome {
  return { ok: false, state: { error } };
}

/** A state carrying field issues and an optional summary. */
function invalid(issues: FieldIssue[], error?: string): SkinMutationOutcome {
  return { ok: false, state: error ? { error, issues } : { issues } };
}

/** Converts anything thrown by the port into a browser-safe action state. */
function toActionState(error: unknown): SkinActionState {
  if (isContentServiceError(error)) {
    return {
      error:
        error.code === "DEPENDENCY_MISSING" ? DEPENDENCY_FAILURE : error.message,
      issues: error.issues.length > 0 ? error.issues : undefined,
    };
  }
  return { error: GENERIC_FAILURE };
}

function readId(formData: FormData): string | null {
  const raw = formData.get("id");
  if (typeof raw !== "string") {
    return null;
  }
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

function readTransition(formData: FormData): DraftTransition | null {
  const raw = formData.get("transition");
  if (typeof raw !== "string") {
    return null;
  }
  return (SKIN_TRANSITIONS as readonly string[]).includes(raw)
    ? (raw as DraftTransition)
    : null;
}

/**
 * Binds the skin workflow to a content service. Production passes the
 * Supabase-backed `contentService`; tests pass the in-memory double.
 */
export function createSkinAdminService(service: ContentService) {
  async function create(formData: FormData): Promise<SkinMutationOutcome> {
    const parsed = parseSkinForm(formData);
    if (!parsed.ok) {
      return invalid(parsed.issues, "Check the highlighted fields.");
    }
    try {
      return { ok: true, skin: await service.createDraftSkin(parsed.value) };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  async function update(formData: FormData): Promise<SkinMutationOutcome> {
    const id = readId(formData);
    if (id === null) {
      return failure(MISSING_ID);
    }
    const parsed = parseSkinForm(formData);
    if (!parsed.ok) {
      return invalid(parsed.issues, "Check the highlighted fields.");
    }
    try {
      return { ok: true, skin: await service.updateDraftSkin(id, parsed.value) };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  async function remove(formData: FormData): Promise<SkinMutationOutcome> {
    const id = readId(formData);
    if (id === null) {
      return failure(MISSING_ID);
    }
    try {
      await service.deleteDraftSkin(id);
      return { ok: true, skin: null };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  async function transition(formData: FormData): Promise<SkinMutationOutcome> {
    const id = readId(formData);
    if (id === null) {
      return failure(MISSING_ID);
    }
    const transitionValue = readTransition(formData);
    if (transitionValue === null) {
      return failure("That change is not supported.");
    }
    try {
      await service.transitionDraftState("skins", id, transitionValue);
      return { ok: true, skin: null };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  return { create, update, remove, transition };
}

export type SkinAdminService = ReturnType<typeof createSkinAdminService>;
