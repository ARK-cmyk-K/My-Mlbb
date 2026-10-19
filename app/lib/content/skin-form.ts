import type { DraftSkin } from "./contracts.ts";
import {
  isUuid,
  readCheckbox,
  readString,
} from "./form-utils.ts";
import {
  SKIN_RARITIES,
  SKIN_VARIANTS,
  validateSkinInput,
  type FieldIssue,
  type SkinInput,
  type SkinRarity,
  type SkinVariant,
  type ValidationResult,
} from "./validation.ts";

/**
 * Skin form ⇄ payload mapping (task 03-02).
 *
 * Mirrors `hero-form.ts`: the editor is a browser form, so every value arrives
 * as a string (or a checkbox's presence/absence). This module owns the one place
 * that turns that raw submission into a validated {@link SkinInput} and, in the
 * other direction, seeds the form from an existing {@link DraftSkin}.
 *
 * It is deliberately pure (no I/O, no Supabase, no `server-only`) so the Server
 * Action and the client form can share it. Nothing here is the authority on
 * validity: `validateSkinInput()` mirrors the database CHECKs and the service
 * re-runs it. This module only *coerces* the form shape and adds the rules the
 * validators cannot express — `heroId` and `splashArtMediaId` are `uuid`
 * columns, so a non-UUID would surface as a raw Postgres error.
 */

/** Options for a skin's `<select>` fields, paired with display labels. */
export const SKIN_RARITY_OPTIONS: ReadonlyArray<{
  value: SkinRarity;
  label: string;
}> = SKIN_RARITIES.map((rarity) => ({
  value: rarity,
  label: rarityLabel(rarity),
}));

export const SKIN_VARIANT_OPTIONS: ReadonlyArray<{
  value: SkinVariant;
  label: string;
}> = SKIN_VARIANTS.map((variant) => ({
  value: variant,
  label: variantLabel(variant),
}));

/** Human-readable label for a rarity (e.g. `"starlight"` → `"Starlight"`). */
export function rarityLabel(rarity: SkinRarity): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

/** Human-readable label for a variant (e.g. `"painted"` → `"Painted"`). */
export function variantLabel(variant: SkinVariant): string {
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}

/** A hero that can be associated with a skin (from `listDraftHeroes`). */
export interface SkinHeroOption {
  value: string;
  label: string;
}

/** Values a skin form holds, all as strings/booleans as the DOM produces them. */
export interface SkinFormValues {
  name: string;
  slug: string;
  heroId: string;
  rarity: string;
  series: string;
  splashArtMediaId: string;
  variant: string;
  acquisitionDate: string;
  acquisitionMilestone: string;
  isOwned: boolean;
  isFavorite: boolean;
}

/** Defaults for a brand-new skin; mirrors the schema defaults (none/false). */
export const EMPTY_SKIN_FORM_VALUES: SkinFormValues = {
  name: "",
  slug: "",
  heroId: "",
  rarity: "",
  series: "",
  splashArtMediaId: "",
  variant: "",
  acquisitionDate: "",
  acquisitionMilestone: "",
  isOwned: false,
  isFavorite: false,
};

/** Seeds the form from a stored skin (edit mode). */
export function skinToFormValues(skin: DraftSkin): SkinFormValues {
  return {
    name: skin.name,
    slug: skin.slug,
    heroId: skin.heroId ?? "",
    rarity: skin.rarity,
    series: skin.series ?? "",
    splashArtMediaId: skin.splashArtMediaId ?? "",
    variant: skin.variant ?? "",
    acquisitionDate: skin.acquisitionDate ?? "",
    acquisitionMilestone: skin.acquisitionMilestone ?? "",
    isOwned: skin.isOwned,
    isFavorite: skin.isFavorite,
  };
}

/**
 * Parses a skin form submission into a validated payload.
 *
 * Field errors (`slug` format, required rarity, date bounds, length limits, …)
 * come from {@link validateSkinInput}; this adds UUID checks for `heroId` and
 * `splashArtMediaId` because both columns are `uuid` and a bad value must not
 * reach PostgREST. Whether the referenced hero/media *exists* is enforced by the
 * service/schema (FK `ON DELETE RESTRICT` → `DEPENDENCY_MISSING`), not here.
 */
export function parseSkinForm(formData: FormData): ValidationResult<SkinInput> {
  const result = validateSkinInput({
    name: readString(formData, "name"),
    slug: readString(formData, "slug"),
    // Blank optional selects/inputs become `null` inside the validator.
    heroId: readString(formData, "heroId"),
    rarity: readString(formData, "rarity"),
    series: readString(formData, "series"),
    splashArtMediaId: readString(formData, "splashArtMediaId"),
    variant: readString(formData, "variant"),
    acquisitionDate: readString(formData, "acquisitionDate"),
    acquisitionMilestone: readString(formData, "acquisitionMilestone"),
    isOwned: readCheckbox(formData, "isOwned"),
    isFavorite: readCheckbox(formData, "isFavorite"),
  });

  if (!result.ok) {
    return result;
  }

  const issues: FieldIssue[] = [];
  if (result.value.heroId !== null && !isUuid(result.value.heroId)) {
    issues.push({
      path: "heroId",
      message: "must be the UUID of an existing hero",
    });
  }
  if (
    result.value.splashArtMediaId !== null &&
    !isUuid(result.value.splashArtMediaId)
  ) {
    issues.push({
      path: "splashArtMediaId",
      message: "must be the UUID of an existing media item",
    });
  }

  return issues.length === 0 ? result : { ok: false, issues };
}

// Re-exported so callers of the skin form get the same slug/error helpers as
// the hero editor, without importing the hero module directly.
export { issuesByPath, slugify } from "./form-utils.ts";
