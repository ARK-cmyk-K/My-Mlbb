import type { FieldIssue } from "./validation.ts";

/**
 * Shared, pure form helpers for the dashboard editors (tasks 03-01 and 03-02).
 *
 * The hero and skin editors are both browser forms, so every value arrives as a
 * string (or a checkbox's presence/absence) and the same coercions are needed in
 * both places. Keeping them here means the two `*-form.ts` modules delegate the
 * DOM shape handling to one implementation instead of drifting apart.
 *
 * This module is pure (no I/O, no Supabase, no `server-only`) so it is safe to
 * import from client components and directly unit-testable. It is NOT the
 * authority on validity — `validation.ts` mirrors the database CHECKs.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a canonical UUID (the id columns are `uuid`). */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** First caller-safe message per field path, for rendering under each input. */
export function issuesByPath(
  issues: FieldIssue[] | undefined
): Record<string, string> {
  const byPath: Record<string, string> = {};
  for (const issue of issues ?? []) {
    if (!(issue.path in byPath)) {
      byPath[issue.path] = issue.message;
    }
  }
  return byPath;
}

/**
 * Turns free text into a schema-valid slug (lowercase, single hyphens) so the
 * create forms can suggest one from the record name. The server still validates
 * it.
 */
export function slugify(value: string, maxLength = 140): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug;
}

/** Reads a text field from a form submission, defaulting to `""`. */
export function readString(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw : "";
}

/**
 * Reads a numeric field. A blank input stays `undefined` so the validator's
 * default (or `null` for an optional number) applies; non-numeric text is
 * passed through as `NaN` so the validator returns a field-level error instead
 * of the value being silently dropped.
 */
export function readOptionalNumber(
  formData: FormData,
  name: string
): number | undefined {
  const raw = readString(formData, name).trim();
  if (raw === "") {
    return undefined;
  }
  return Number(raw);
}

/** An unchecked checkbox is absent from the submission entirely. */
export function readCheckbox(formData: FormData, name: string): boolean {
  const raw = formData.get(name);
  return raw === "on" || raw === "true" || raw === "1";
}
