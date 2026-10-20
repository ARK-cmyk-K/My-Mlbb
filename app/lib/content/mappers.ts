import type {
  AchievementCategory,
  HeroRole,
  PublicationState,
  SkinRarity,
  SkinVariant,
  ThemePreset,
  TimelineKind,
} from "./validation.ts";
import type {
  ActiveRelease,
  DraftAchievement,
  DraftAppearanceSettings,
  DraftHero,
  DraftHomepageSection,
  DraftSkin,
  DraftTimelineEntry,
  PublishedAchievement,
  PublishedHero,
  PublishedSkin,
  PublishedTimelineEntry,
} from "./contracts.ts";
/**
 * Row -> DTO mappers for the content service (task 02-03).
 *
 * Supabase returns snake_case columns; the service boundary speaks camelCase
 * DTOs. Keeping mapping in one place means a schema rename touches this file
 * only, and it lets tests feed plain object literals without a database.
 *
 * The mappers are defensive: every enum is written through a small cast that
 * trusts the database CHECK/enum constraint. They never invent values — a NULL
 * stays `null` (the schema treats NULL as "not recorded", and the UI must show
 * it as unavailable rather than guess).
 */

/** A raw row as returned by Supabase (superset of columns). */
type Row = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableStr(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function bool(value: unknown): boolean {
  return value === true;
}

function num(value: unknown): number {
  // Postgres `numeric` arrives as a string from PostgREST; coerce safely.
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A draft row's lifecycle state. Defaults to `"draft"` when the column is
 * missing so an incomplete select cannot accidentally look "published".
 */
function publicationState(value: unknown): PublicationState {
  return value === "published" || value === "archived" ? value : "draft";
}

export function toDraftHero(row: Row): DraftHero {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    primaryRole: row.primary_role as HeroRole,
    secondaryRole: (row.secondary_role ?? null) as HeroRole | null,
    specialty: nullableStr(row.specialty),
    portraitMediaId: nullableStr(row.portrait_media_id),
    masteryLevel: num(row.mastery_level),
    totalMatches: num(row.total_matches),
    winRate: nullableNum(row.win_rate),
    isSignature: bool(row.is_signature),
    isFavorite: bool(row.is_favorite),
    publicationState: publicationState(row.publication_state),
    archivedAt: nullableStr(row.archived_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toPublishedHero(row: Row): PublishedHero {
  return {
    id: str(row.id),
    releaseId: str(row.release_id),
    name: str(row.name),
    slug: str(row.slug),
    primaryRole: row.primary_role as HeroRole,
    secondaryRole: (row.secondary_role ?? null) as HeroRole | null,
    specialty: nullableStr(row.specialty),
    portraitMediaId: nullableStr(row.portrait_media_id),
    masteryLevel: num(row.mastery_level),
    totalMatches: num(row.total_matches),
    winRate: nullableNum(row.win_rate),
    isSignature: bool(row.is_signature),
    isFavorite: bool(row.is_favorite),
    publishedAt: str(row.published_at),
  };
}

export function toDraftSkin(row: Row): DraftSkin {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    heroId: nullableStr(row.hero_id),
    rarity: row.rarity as SkinRarity,
    series: nullableStr(row.series),
    splashArtMediaId: nullableStr(row.splash_art_media_id),
    variant: (row.variant ?? null) as SkinVariant | null,
    acquisitionDate: nullableStr(row.acquisition_date),
    acquisitionMilestone: nullableStr(row.acquisition_milestone),
    isOwned: bool(row.is_owned),
    isFavorite: bool(row.is_favorite),
    publicationState: publicationState(row.publication_state),
    archivedAt: nullableStr(row.archived_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toPublishedSkin(row: Row): PublishedSkin {
  return {
    id: str(row.id),
    releaseId: str(row.release_id),
    heroId: nullableStr(row.hero_id),
    name: str(row.name),
    slug: str(row.slug),
    rarity: row.rarity as SkinRarity,
    series: nullableStr(row.series),
    splashArtMediaId: nullableStr(row.splash_art_media_id),
    variant: (row.variant ?? null) as SkinVariant | null,
    acquisitionDate: nullableStr(row.acquisition_date),
    acquisitionMilestone: nullableStr(row.acquisition_milestone),
    isOwned: bool(row.is_owned),
    isFavorite: bool(row.is_favorite),
    publishedAt: str(row.published_at),
  };
}

export function toDraftAchievement(row: Row): DraftAchievement {
  return {
    id: str(row.id),
    title: str(row.title),
    description: nullableStr(row.description),
    category: row.category as AchievementCategory,
    earnedOn: nullableStr(row.earned_on),
    iconMediaId: nullableStr(row.icon_media_id),
    publicationState: publicationState(row.publication_state),
    archivedAt: nullableStr(row.archived_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toPublishedAchievement(row: Row): PublishedAchievement {
  return {
    id: str(row.id),
    releaseId: str(row.release_id),
    title: str(row.title),
    description: nullableStr(row.description),
    category: row.category as AchievementCategory,
    earnedOn: nullableStr(row.earned_on),
    iconMediaId: nullableStr(row.icon_media_id),
    publishedAt: str(row.published_at),
  };
}

export function toDraftTimelineEntry(row: Row): DraftTimelineEntry {
  return {
    id: str(row.id),
    title: str(row.title),
    body: nullableStr(row.body),
    kind: row.kind as TimelineKind,
    occurredOn: str(row.occurred_on),
    mediaId: nullableStr(row.media_id),
    isHighlight: bool(row.is_highlight),
    publicationState: publicationState(row.publication_state),
    archivedAt: nullableStr(row.archived_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toPublishedTimelineEntry(row: Row): PublishedTimelineEntry {
  return {
    id: str(row.id),
    releaseId: str(row.release_id),
    title: str(row.title),
    body: nullableStr(row.body),
    kind: row.kind as TimelineKind,
    occurredOn: str(row.occurred_on),
    mediaId: nullableStr(row.media_id),
    isHighlight: bool(row.is_highlight),
    publishedAt: str(row.published_at),
  };
}

export function toDraftAppearanceSettings(row: Row): DraftAppearanceSettings {
  return {
    id: typeof row.id === "number" ? row.id : Number(row.id ?? 1),
    themePreset: (row.theme_preset ?? "adaptive") as ThemePreset,
    primaryAccent: str(row.primary_accent),
    secondaryAccent: str(row.secondary_accent),
    typographyScale: num(row.typography_scale),
    containerWidthPx: num(row.container_width_px),
    spacingScale: num(row.spacing_scale),
    customCss: nullableStr(row.custom_css),
    publicationState: publicationState(row.publication_state),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toDraftHomepageSection(row: Row): DraftHomepageSection {
  return {
    sectionId: str(row.section_id),
    position: num(row.position),
    isEnabled: bool(row.is_enabled),
    publicationState: publicationState(row.publication_state),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toActiveRelease(row: Row): ActiveRelease {
  return {
    id: str(row.id),
    name: str(row.name),
    publishedAt: nullableStr(row.published_at),
    updatedAt: str(row.updated_at),
  };
}
/** Column lists, kept beside the mappers so both stay in one file. */
export const DRAFT_HERO_COLUMNS =
  "id, name, slug, primary_role, secondary_role, specialty, portrait_media_id, mastery_level, total_matches, win_rate, is_signature, is_favorite, publication_state, archived_at, created_at, updated_at" as const;

export const DRAFT_SKIN_COLUMNS =
  "id, name, slug, hero_id, rarity, series, splash_art_media_id, variant, acquisition_date, acquisition_milestone, is_owned, is_favorite, publication_state, archived_at, created_at, updated_at" as const;

export const DRAFT_ACHIEVEMENT_COLUMNS =
  "id, title, description, category, earned_on, icon_media_id, publication_state, archived_at, created_at, updated_at" as const;

export const DRAFT_TIMELINE_COLUMNS =
  "id, title, body, kind, occurred_on, media_id, is_highlight, publication_state, archived_at, created_at, updated_at" as const;
export const DRAFT_APPEARANCE_SETTINGS_COLUMNS =
  "id, theme_preset, primary_accent, secondary_accent, typography_scale, container_width_px, spacing_scale, custom_css, publication_state, created_at, updated_at" as const;
export const DRAFT_HOMEPAGE_SECTION_COLUMNS =
  "section_id, position, is_enabled, publication_state, created_at, updated_at" as const;
export const PUBLISHED_HERO_COLUMNS =
  "id, release_id, name, slug, primary_role, secondary_role, specialty, portrait_media_id, mastery_level, total_matches, win_rate, is_signature, is_favorite, published_at" as const;

export const PUBLISHED_SKIN_COLUMNS =
  "id, release_id, hero_id, name, slug, rarity, series, splash_art_media_id, variant, acquisition_date, acquisition_milestone, is_owned, is_favorite, published_at" as const;

export const PUBLISHED_ACHIEVEMENT_COLUMNS =
  "id, release_id, title, description, category, earned_on, icon_media_id, published_at" as const;

export const PUBLISHED_TIMELINE_COLUMNS =
  "id, release_id, title, body, kind, occurred_on, media_id, is_highlight, published_at" as const;

export const ACTIVE_RELEASE_COLUMNS =
  "id, name, published_at, updated_at" as const;
