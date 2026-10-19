import type { DraftHero, DraftTransition } from "./contracts.ts";
import { isContentServiceError } from "./errors.ts";
import { parseHeroForm } from "./hero-form.ts";
import type { ContentService } from "./port.ts";
import type { FieldIssue } from "./validation.ts";

/**
 * Hero management orchestration (task 03-01).
 *
 * This is the piece between the Server Actions and the content-service port. It
 * exists so the *behaviour* the dashboard relies on — "which fields are
 * required", "an unauthorized caller cannot mutate", "a failed write becomes a
 * typed, caller-safe message instead of a Postgres error" — is testable without
 * a database or a running server.
 *
 * The Server Action does the Next.js-only work (`revalidatePath`, `redirect`);
 * this module only parses input, calls the port and converts a thrown
 * `ContentServiceError` into a serializable state. It is pure enough to run
 * against `createInMemoryContentService` in the unit suite.
 *
 * Security:
 *   - Authorization is delegated to the port, which fails closed; this module
 *     never decides who is an admin and never reaches around the port.
 *   - Nothing but a `ContentServiceError`'s caller-safe message/issues leaves
 *     here. A raw failure becomes one generic message, so no SQL, table or
 *     stack detail can reach the browser.
 */

/** The `useActionState` payload a hero form renders (all values are safe). */
export interface HeroActionState {
  /** Caller-safe, non-field error message. Absent when the submission was clean. */
  error?: string;
  /** Field-level problems, rendered under the matching input. */
  issues?: FieldIssue[];
}

/** Result of one mutation, so the Server Action knows whether to redirect. */
export type HeroMutationOutcome =
  | { ok: true; hero: DraftHero | null }
  | { ok: false; state: HeroActionState };

const GENERIC_FAILURE = "Something went wrong. Please try again.";
const MISSING_ID = "The selected hero could not be identified. Reload and retry.";

/** The lifecycle transitions the hero list/edit actions may request. */
export const HERO_TRANSITIONS: readonly DraftTransition[] = [
  "publish",
  "unpublish",
  "archive",
  "restore",
] as const;

/** A state carrying only a non-field error. */
function failure(error: string): HeroMutationOutcome {
  return { ok: false, state: { error } };
}

/** A state carrying field issues and an optional summary. */
function invalid(issues: FieldIssue[], error?: string): HeroMutationOutcome {
  return { ok: false, state: error ? { error, issues } : { issues } };
}

/** Converts anything thrown by the port into a browser-safe action state. */
function toActionState(error: unknown): HeroActionState {
  if (isContentServiceError(error)) {
    return {
      error: error.message,
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
  return (HERO_TRANSITIONS as readonly string[]).includes(raw)
    ? (raw as DraftTransition)
    : null;
}

/**
 * Binds the hero workflow to a content service. Production passes the
 * Supabase-backed `contentService`; tests pass the in-memory double.
 */
export function createHeroAdminService(service: ContentService) {
  async function create(formData: FormData): Promise<HeroMutationOutcome> {
    const parsed = parseHeroForm(formData);
    if (!parsed.ok) {
      return invalid(parsed.issues, "Check the highlighted fields.");
    }
    try {
      return { ok: true, hero: await service.createDraftHero(parsed.value) };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  async function update(formData: FormData): Promise<HeroMutationOutcome> {
    const id = readId(formData);
    if (id === null) {
      return failure(MISSING_ID);
    }
    const parsed = parseHeroForm(formData);
    if (!parsed.ok) {
      return invalid(parsed.issues, "Check the highlighted fields.");
    }
    try {
      return { ok: true, hero: await service.updateDraftHero(id, parsed.value) };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  async function remove(formData: FormData): Promise<HeroMutationOutcome> {
    const id = readId(formData);
    if (id === null) {
      return failure(MISSING_ID);
    }
    try {
      await service.deleteDraftHero(id);
      return { ok: true, hero: null };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  async function transition(formData: FormData): Promise<HeroMutationOutcome> {
    const id = readId(formData);
    if (id === null) {
      return failure(MISSING_ID);
    }
    const transitionValue = readTransition(formData);
    if (transitionValue === null) {
      return failure("That change is not supported.");
    }
    try {
      await service.transitionDraftState("heroes", id, transitionValue);
      return { ok: true, hero: null };
    } catch (error) {
      return { ok: false, state: toActionState(error) };
    }
  }

  return { create, update, remove, transition };
}

export type HeroAdminService = ReturnType<typeof createHeroAdminService>;
