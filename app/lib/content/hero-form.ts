import type { DraftHero } from "./contracts.ts";
import {
  HERO_ROLES,
  validateHeroInput,
  type FieldIssue,
  type HeroInput,
  type HeroRole,
  type ValidationResult,
} from "./validation.ts";

/**
 * Hero form ⇄ payload mapping (task 03-01).
 *
 * The hero editor is a browser form, so every value arrives as a string (or a
 * checkbox's presence/absence). This module owns the one place that turns that
 * raw submission into a validated {@link HeroInput} and, in the other
 * direction, seeds the form from an existing {@link DraftHero}.
 *
 * It is deliberately pure (no I/O, no Supabase, no `server-only`) so:
 *   - the Server Action can reuse it before touching the content service, and
 *   - the client form can import the role allowlist and {@link slugify} for
 *     immediate feedback without bundling any privileged code.
 *
 * Nothing here is the authority on validity: `validateHeroInput()` mirrors the
 * database CHECKs and the service re-runs it. This module only *coerces* the
 * form shape and adds the one rule the validators cannot express (`portraitMediaId`
 * is a `uuid` column, so a non-UUID would surface as a raw Postgres error).
 */

/** Role options for the form's `<select>`, paired with display labels. */
export const HERO_ROLE_OPTIONS: ReadonlyArray<{ value: HeroRole; label: string }> =
  HERO_ROLES.map((role) => ({ value: role, label: roleLabel(role) }));

/** Human-readable label for a hero role (e.g. `"marksman"` → `"Marksman"`). */
export function roleLabel(role: HeroRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Values a hero form holds, all as strings/booleans as the DOM produces them. */
export interface HeroFormValues {
  name: string;
  slug: string;
  primaryRole: string;
  secondaryRole: string;
  specialty: string;
  portraitMediaId: string;
  masteryLevel: string;
  totalMatches: string;
  winRate: string;
  isSignature: boolean;
  isFavorite: boolean;
}

/** Defaults for a brand-new hero; mirrors the schema defaults (0 / none). */
export const EMPTY_HERO_FORM_VALUES: HeroFormValues = {
  name: "",
  slug: "",
  primaryRole: "",
  secondaryRole: "",
  specialty: "",
  portraitMediaId: "",
  masteryLevel: "0",
  totalMatches: "0",
  winRate: "",
  isSignature: false,
  isFavorite: false,
};

/** Seeds the form from a stored hero (edit mode). */
export function heroToFormValues(hero: DraftHero): HeroFormValues {
  return {
    name: hero.name,
    slug: hero.slug,
    primaryRole: hero.primaryRole,
    secondaryRole: hero.secondaryRole ?? "",
    specialty: hero.specialty ?? "",
    portraitMediaId: hero.portraitMediaId ?? "",
    masteryLevel: String(hero.masteryLevel),
    totalMatches: String(hero.totalMatches),
    winRate: hero.winRate === null ? "" : String(hero.winRate),
    isSignature: hero.isSignature,
    isFavorite: hero.isFavorite,
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a canonical UUID (the `media.id` column type). */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Parses a hero form submission into a validated payload.
 *
 * Field errors (`slug` format, numeric bounds, required enum, duplicate roles)
 * come from {@link validateHeroInput}; this adds a `portraitMediaId` UUID check
 * because the column is `uuid` and a bad value must not reach PostgREST.
 */
export function parseHeroForm(formData: FormData): ValidationResult<HeroInput> {
  const result = validateHeroInput({
    name: readString(formData, "name"),
    slug: readString(formData, "slug"),
    primaryRole: readString(formData, "primaryRole"),
    // Blank optional selects/inputs become `null` inside the validator.
    secondaryRole: readString(formData, "secondaryRole"),
    specialty: readString(formData, "specialty"),
    portraitMediaId: readString(formData, "portraitMediaId"),
    masteryLevel: readOptionalNumber(formData, "masteryLevel"),
    totalMatches: readOptionalNumber(formData, "totalMatches"),
    winRate: readOptionalNumber(formData, "winRate"),
    isSignature: readCheckbox(formData, "isSignature"),
    isFavorite: readCheckbox(formData, "isFavorite"),
  });

  if (!result.ok) {
    return result;
  }

  const mediaId = result.value.portraitMediaId;
  if (mediaId !== null && !isUuid(mediaId)) {
    return {
      ok: false,
      issues: [
        {
          path: "portraitMediaId",
          message: "must be the UUID of an existing media item",
        },
      ],
    };
  }

  return result;
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
 * create form can suggest one from the hero name. The server still validates it.
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

function readString(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw : "";
}

/**
 * Reads a numeric field. A blank input stays `undefined` so the validator's
 * default (or `null` for the optional win rate) applies; non-numeric text is
 * passed through as `NaN` so the validator returns a field-level error instead
 * of the value being silently dropped.
 */
function readOptionalNumber(formData: FormData, name: string): number | undefined {
  const raw = readString(formData, name).trim();
  if (raw === "") {
    return undefined;
  }
  return Number(raw);
}

/** An unchecked checkbox is absent from the submission entirely. */
function readCheckbox(formData: FormData, name: string): boolean {
  const raw = formData.get(name);
  return raw === "on" || raw === "true" || raw === "1";
}
