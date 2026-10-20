/**
 * Validation primitives for the draft/published content service (task 02-03).
 *
 * Every rule in this module mirrors a CHECK constraint or enum in
 * `supabase/migrations/20261019104827_core_schema.sql`. They are duplicated here
 * on purpose: the database remains the final authority, but the service must be
 * able to reject bad input *before* it reaches the network, return a typed,
 * field-level error to the dashboard, and never rely on a raw Postgres error
 * message. If a CHECK changes in a migration, change it here in the same task.
 *
 * The module is pure (no I/O, no Supabase, no `process.env`), so it is directly
 * unit-testable and safe to import from any server module. It is NOT imported
 * into client components — validation is a server-boundary concern.
 */

/** A single field-level validation problem. */
export interface FieldIssue {
  /** Dot path of the offending field, e.g. `"name"` or `"winRate"`. */
  path: string;
  /** Human-readable, caller-safe explanation. Never contains SQL details. */
  message: string;
}

/** Result of validating one record: either normalized data or issues. */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: FieldIssue[] };

/** Enumerations mirrored from the core-schema migration. */
export const HERO_ROLES = [
  "tank",
  "fighter",
  "assassin",
  "mage",
  "marksman",
  "support",
] as const;
export type HeroRole = (typeof HERO_ROLES)[number];

export const SKIN_RARITIES = [
  "basic",
  "elite",
  "special",
  "starlight",
  "epic",
  "legend",
  "collector",
] as const;
export type SkinRarity = (typeof SKIN_RARITIES)[number];

export const SKIN_VARIANTS = ["model", "painted", "other"] as const;
export type SkinVariant = (typeof SKIN_VARIANTS)[number];

export const ACHIEVEMENT_CATEGORIES = [
  "rank",
  "gameplay",
  "event",
  "career",
  "collection",
  "other",
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const TIMELINE_KINDS = [
  "milestone",
  "event",
  "achievement",
  "release",
  "update",
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const PUBLICATION_STATES = ["draft", "published", "archived"] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** Lower/upper date bounds mirrored from the schema's date-range CHECKs. */
export const DATE_BOUNDS = { min: "2010-01-01", max: "2100-12-31" } as const;

/** Slug pattern shared by heroes and skins (`heroes_slug_format`). */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Section-id pattern (`homepage_sections_id_format`). */
const SECTION_ID_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredTrimmedString(
  raw: unknown,
  path: string,
  maxLength: number,
  issues: FieldIssue[]
): string {
  if (typeof raw !== "string") {
    issues.push({ path, message: "must be a string" });
    return "";
  }
  const value = raw.trim();
  if (value.length === 0) {
    issues.push({ path, message: "must not be empty" });
  } else if (value.length > maxLength) {
    issues.push({ path, message: `must be at most ${maxLength} characters` });
  }
  return value;
}

function optionalTrimmedString(
  raw: unknown,
  path: string,
  maxLength: number,
  issues: FieldIssue[]
): string | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  if (typeof raw !== "string") {
    issues.push({ path, message: "must be a string" });
    return null;
  }
  const value = raw.trim();
  if (value.length === 0) {
    return null;
  }
  if (value.length > maxLength) {
    issues.push({ path, message: `must be at most ${maxLength} characters` });
    return null;
  }
  return value;
}

function integerInRange(
  raw: unknown,
  path: string,
  min: number,
  max: number,
  issues: FieldIssue[]
): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    issues.push({ path, message: "must be a whole number" });
    return min;
  }
  if (raw < min || raw > max) {
    issues.push({ path, message: `must be between ${min} and ${max}` });
    return min;
  }
  return raw;
}

function optionalNumberInRange(
  raw: unknown,
  path: string,
  min: number,
  max: number,
  issues: FieldIssue[]
): number | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    issues.push({ path, message: "must be a number" });
    return null;
  }
  if (raw < min || raw > max) {
    issues.push({ path, message: `must be between ${min} and ${max}` });
    return null;
  }
  // Round to the numeric(5,2) scale used by the schema.
  return Math.round(raw * 100) / 100;
}

function optionalEnum<T extends string>(
  raw: unknown,
  path: string,
  allowed: readonly T[],
  issues: FieldIssue[]
): T | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    issues.push({
      path,
      message: `must be one of: ${allowed.join(", ")}`,
    });
    return null;
  }
  return raw as T;
}

function requiredEnum<T extends string>(
  raw: unknown,
  path: string,
  allowed: readonly T[],
  issues: FieldIssue[]
): T {
  const value = optionalEnum(raw, path, allowed, issues);
  if (value === null) {
    if (raw === undefined || raw === null || raw === "") {
      issues.push({ path, message: "is required" });
    }
    // Return the first allowed value as a placeholder; `ok` is false anyway.
    return allowed[0];
  }
  return value;
}

function optionalDate(
  raw: unknown,
  path: string,
  issues: FieldIssue[]
): string | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    issues.push({ path, message: "must be an ISO date (YYYY-MM-DD)" });
    return null;
  }
  if (raw < DATE_BOUNDS.min || raw > DATE_BOUNDS.max) {
    issues.push({
      path,
      message: `must be between ${DATE_BOUNDS.min} and ${DATE_BOUNDS.max}`,
    });
    return null;
  }
  return raw;
}

function optionalBoolean(
  raw: unknown,
  path: string,
  issues: FieldIssue[]
): boolean {
  if (raw === undefined || raw === null) {
    return false;
  }
  if (typeof raw !== "boolean") {
    issues.push({ path, message: "must be true or false" });
    return false;
  }
  return raw;
}

/** A hero as normalized by {@link validateHeroInput}. */
export interface HeroInput {
  name: string;
  slug: string;
  primaryRole: HeroRole;
  secondaryRole: HeroRole | null;
  specialty: string | null;
  portraitMediaId: string | null;
  masteryLevel: number;
  totalMatches: number;
  winRate: number | null;
  isSignature: boolean;
  isFavorite: boolean;
}

/** Validates and normalizes a hero create/update payload. */
export function validateHeroInput(
  input: unknown
): ValidationResult<HeroInput> {
  const issues: FieldIssue[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: "", message: "must be an object" }] };
  }

  const name = requiredTrimmedString(input.name, "name", 120, issues);
  const slug = requiredTrimmedString(input.slug, "slug", 140, issues);
  if (slug.length > 0 && !SLUG_PATTERN.test(slug)) {
    issues.push({
      path: "slug",
      message: "must be lowercase letters, numbers and single hyphens",
    });
  }

  const primaryRole = requiredEnum(
    input.primaryRole,
    "primaryRole",
    HERO_ROLES,
    issues
  );
  const secondaryRole = optionalEnum(
    input.secondaryRole,
    "secondaryRole",
    HERO_ROLES,
    issues
  );
  if (secondaryRole !== null && secondaryRole === primaryRole) {
    issues.push({
      path: "secondaryRole",
      message: "must differ from the primary role",
    });
  }

  const value: HeroInput = {
    name,
    slug,
    primaryRole,
    secondaryRole,
    specialty: optionalTrimmedString(input.specialty, "specialty", 120, issues),
    portraitMediaId: optionalTrimmedString(
      input.portraitMediaId,
      "portraitMediaId",
      64,
      issues
    ),
    masteryLevel: integerInRange(
      input.masteryLevel ?? 0,
      "masteryLevel",
      0,
      100,
      issues
    ),
    totalMatches: integerInRange(
      input.totalMatches ?? 0,
      "totalMatches",
      0,
      Number.MAX_SAFE_INTEGER,
      issues
    ),
    winRate: optionalNumberInRange(input.winRate, "winRate", 0, 100, issues),
    isSignature: optionalBoolean(input.isSignature, "isSignature", issues),
    isFavorite: optionalBoolean(input.isFavorite, "isFavorite", issues),
  };

  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

/** A skin as normalized by {@link validateSkinInput}. */
export interface SkinInput {
  name: string;
  slug: string;
  heroId: string | null;
  rarity: SkinRarity;
  series: string | null;
  splashArtMediaId: string | null;
  variant: SkinVariant | null;
  acquisitionDate: string | null;
  acquisitionMilestone: string | null;
  isOwned: boolean;
  isFavorite: boolean;
}

/** Validates and normalizes a skin create/update payload. */
export function validateSkinInput(
  input: unknown
): ValidationResult<SkinInput> {
  const issues: FieldIssue[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: "", message: "must be an object" }] };
  }

  const name = requiredTrimmedString(input.name, "name", 120, issues);
  const slug = requiredTrimmedString(input.slug, "slug", 140, issues);
  if (slug.length > 0 && !SLUG_PATTERN.test(slug)) {
    issues.push({
      path: "slug",
      message: "must be lowercase letters, numbers and single hyphens",
    });
  }

  const value: SkinInput = {
    name,
    slug,
    heroId: optionalTrimmedString(input.heroId, "heroId", 64, issues),
    rarity: requiredEnum(input.rarity, "rarity", SKIN_RARITIES, issues),
    series: optionalTrimmedString(input.series, "series", 160, issues),
    splashArtMediaId: optionalTrimmedString(
      input.splashArtMediaId,
      "splashArtMediaId",
      64,
      issues
    ),
    variant: optionalEnum(input.variant, "variant", SKIN_VARIANTS, issues),
    acquisitionDate: optionalDate(
      input.acquisitionDate,
      "acquisitionDate",
      issues
    ),
    acquisitionMilestone: optionalTrimmedString(
      input.acquisitionMilestone,
      "acquisitionMilestone",
      160,
      issues
    ),
    isOwned: optionalBoolean(input.isOwned, "isOwned", issues),
    isFavorite: optionalBoolean(input.isFavorite, "isFavorite", issues),
  };

  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

/** A timeline entry as normalized by {@link validateTimelineEntryInput}. */
export interface TimelineEntryInput {
  title: string;
  body: string | null;
  kind: TimelineKind;
  occurredOn: string;
  mediaId: string | null;
  isHighlight: boolean;
}

/** Validates and normalizes a timeline-entry payload. */
export function validateTimelineEntryInput(
  input: unknown
): ValidationResult<TimelineEntryInput> {
  const issues: FieldIssue[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: "", message: "must be an object" }] };
  }

  const occurredOn = optionalDate(input.occurredOn, "occurredOn", issues);
  if (occurredOn === null) {
    issues.push({ path: "occurredOn", message: "is required" });
  }

  const value: TimelineEntryInput = {
    title: requiredTrimmedString(input.title, "title", 140, issues),
    body: optionalTrimmedString(input.body, "body", 2000, issues),
    kind: requiredEnum(input.kind, "kind", TIMELINE_KINDS, issues),
    occurredOn: occurredOn ?? DATE_BOUNDS.min,
    mediaId: optionalTrimmedString(input.mediaId, "mediaId", 64, issues),
    isHighlight: optionalBoolean(input.isHighlight, "isHighlight", issues),
  };

  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

/**
 * Validates a homepage-section ordering payload (`04-02` will supply the
 * approved-module allowlist; this task only enforces the *shape* and the
 * schema-level pattern so a release snapshot can never be written with
 * identifiers that would violate the database CHECK).
 */
export function validateHomepageSections(
  input: unknown
): ValidationResult<Array<{ sectionId: string; position: number; isEnabled: boolean }>> {
  const issues: FieldIssue[] = [];
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ path: "", message: "must be an array" }] };
  }

  const seenPositions = new Set<number>();
  const value = input.map((entry, index) => {
    const path = `[${index}]`;
    if (!isPlainObject(entry)) {
      issues.push({ path, message: "must be an object" });
      return { sectionId: "", position: index, isEnabled: true };
    }
    const sectionId = requiredTrimmedString(
      entry.sectionId,
      `${path}.sectionId`,
      64,
      issues
    );
    if (sectionId.length > 0 && !SECTION_ID_PATTERN.test(sectionId)) {
      issues.push({
        path: `${path}.sectionId`,
        message: "must be lowercase letters, numbers and underscores",
      });
    }
    const position = integerInRange(
      entry.position,
      `${path}.position`,
      0,
      Number.MAX_SAFE_INTEGER,
      issues
    );
    if (seenPositions.has(position)) {
      issues.push({
        path: `${path}.position`,
        message: "must be unique across sections",
      });
    }
    seenPositions.add(position);

    return {
      sectionId,
      position,
      isEnabled: optionalBoolean(
        entry.isEnabled,
        `${path}.isEnabled`,
        issues
      ),
    };
  });

  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

/** Theme presets mirrored from the `appearance_settings_theme_preset` CHECK. */
export const THEME_PRESETS = ["dark", "light", "adaptive"] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** Input shape for appearance settings (mirrors `DraftAppearanceSettings`). */
export interface AppearanceSettingsInput {
  themePreset: ThemePreset;
  primaryAccent: string;
  secondaryAccent: string;
  typographyScale: number;
  containerWidthPx: number;
  spacingScale: number;
  customCss?: string | null;
}

/** Validates and normalizes an appearance settings payload. */
export function validateAppearanceSettingsInput(
  input: unknown
): ValidationResult<AppearanceSettingsInput> {
  const issues: FieldIssue[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: "", message: "must be an object" }] };
  }

  const themePreset = requiredEnum(
    input.themePreset,
    "themePreset",
    THEME_PRESETS,
    issues
  );
  const primaryAccent = requiredTrimmedString(
    input.primaryAccent,
    "primaryAccent",
    7,
    issues
  );
  if (primaryAccent.length > 0 && !/^#[0-9a-fA-F]{6}$/.test(primaryAccent)) {
    issues.push({ path: "primaryAccent", message: "must be a 6-digit hex color" });
  }
  const secondaryAccent = requiredTrimmedString(
    input.secondaryAccent,
    "secondaryAccent",
    7,
    issues
  );
  if (secondaryAccent.length > 0 && !/^#[0-9a-fA-F]{6}$/.test(secondaryAccent)) {
    issues.push({ path: "secondaryAccent", message: "must be a 6-digit hex color" });
  }
  const typographyScale = optionalNumberInRange(
    input.typographyScale,
    "typographyScale",
    0.75,
    1.5,
    issues
  );
  const containerWidthPx = integerInRange(
    (input.containerWidthPx as number) ?? 1200,
    "containerWidthPx",
    960,
    1600,
    issues
  );
  const spacingScale = optionalNumberInRange(
    input.spacingScale,
    "spacingScale",
    0.75,
    1.5,
    issues
  );

  const customCss =
    input.customCss === undefined || input.customCss === null || input.customCss === ""
      ? null
      : typeof input.customCss === "string"
        ? input.customCss
        : null;
  if (input.customCss !== undefined && input.customCss !== null && typeof input.customCss !== "string") {
    issues.push({ path: "customCss", message: "must be a string" });
  }

  const value: AppearanceSettingsInput = {
    themePreset,
    primaryAccent,
    secondaryAccent,
    typographyScale: typographyScale ?? 1,
    containerWidthPx,
    spacingScale: spacingScale ?? 1,
    customCss,
  };

  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

/** Input shape for homepage section ordering. */
export type HomepageSectionOrderInput = {
  sectionId: string;
  position: number;
  isEnabled: boolean;
};

/** Alias matching the service's expected validator name. */
export const validateHomepageSectionOrder = validateHomepageSections;

/** Presentational CSS properties considered safe for custom CSS. */
export const SAFE_CSS_PROPERTIES = new Set<string>([
  "color",
  "background",
  "background-color",
  "font",
  "font-size",
  "font-weight",
  "font-family",
  "font-style",
  "width",
  "height",
  "max-width",
  "min-width",
  "max-height",
  "min-height",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "gap",
  "opacity",
  "border",
  "border-radius",
  "border-width",
  "border-color",
  "border-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "display",
  "flex",
  "flex-direction",
  "align-items",
  "justify-content",
]);

/** Validates a custom CSS block against the safe-property allowlist. */
export function validateCustomCss(raw: unknown): ValidationResult<string> {
  const issues: FieldIssue[] = [];
  if (typeof raw !== "string") {
    issues.push({ path: "", message: "must be a string" });
    return { ok: false, issues };
  }
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: true, value: "" };
  }
  if (value.length > 20000) {
    issues.push({ path: "", message: "must be at most 20000 characters" });
    return { ok: false, issues };
  }
  const lower = value.toLowerCase();
  if (lower.includes("@import")) {
    issues.push({ path: "", message: "must not contain @import" });
  }
  if (lower.includes("url(")) {
    issues.push({ path: "", message: "must not contain url()" });
  }
  if (lower.includes("expression(")) {
    issues.push({ path: "", message: "must not contain expression()" });
  }
  if (lower.includes("javascript:")) {
    issues.push({ path: "", message: "must not contain javascript:" });
  }
  if (/[<>]/.test(value)) {
    issues.push({ path: "", message: "must not contain unsafe characters" });
  }

  const blocks = value.split("}");
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length === 0) continue;
    const openIndex = trimmed.indexOf("{");
    if (openIndex === -1) continue;
    const declarations = trimmed.slice(openIndex + 1).split(";");
    for (const decl of declarations) {
      const d = decl.trim();
      if (d.length === 0) continue;
      const colon = d.indexOf(":");
      if (colon === -1) {
        issues.push({ path: "", message: "must be valid CSS declarations" });
        continue;
      }
      const prop = d.slice(0, colon).trim().toLowerCase();
      const val = d.slice(colon + 1).trim();
      if (!SAFE_CSS_PROPERTIES.has(prop)) {
        issues.push({ path: "", message: `property "${prop}" is not allowed` });
      }
      const vLower = val.toLowerCase();
      if (/[<>]/.test(val) || vLower.includes("url(") || vLower.includes("expression(") || vLower.includes("javascript:")) {
        issues.push({ path: "", message: "unsafe value" });
      }
    }
  }

  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}
