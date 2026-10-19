import type {
  AchievementCategory,
  HeroRole,
  PublicationState,
  SkinRarity,
  SkinVariant,
  TimelineKind,
} from "./validation.ts";

/**
 * Public service contracts for the draft/published content service (task 02-03).
 *
 * These types are the *boundary*: route handlers, Server Actions and UI
 * components depend on them, never on raw Supabase rows. Keeping the shapes here
 * means a schema rename touches one file, and it lets route handlers/tests
 * substitute an in-memory implementation without a database.
 */

/** Lifecycle marker for a draft row (mirrors `public.publication_state`). */
export type DraftState = PublicationState;

/** A hero as stored in the draft working set. */
export interface DraftHero {
  id: string;
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
  publicationState: DraftState;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A hero in the published projection (public read path). */
export interface PublishedHero {
  id: string;
  releaseId: string;
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
  publishedAt: string;
}

/** A skin as stored in the draft working set. */
export interface DraftSkin {
  id: string;
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
  publicationState: DraftState;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A skin in the published projection. */
export interface PublishedSkin {
  id: string;
  releaseId: string;
  heroId: string | null;
  name: string;
  slug: string;
  rarity: SkinRarity;
  series: string | null;
  splashArtMediaId: string | null;
  variant: SkinVariant | null;
  acquisitionDate: string | null;
  acquisitionMilestone: string | null;
  isOwned: boolean;
  isFavorite: boolean;
  publishedAt: string;
}

/** An achievement as stored in the draft working set. */
export interface DraftAchievement {
  id: string;
  title: string;
  description: string | null;
  category: AchievementCategory;
  earnedOn: string | null;
  iconMediaId: string | null;
  publicationState: DraftState;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A timeline entry as stored in the draft working set. */
export interface DraftTimelineEntry {
  id: string;
  title: string;
  body: string | null;
  kind: TimelineKind;
  occurredOn: string;
  mediaId: string | null;
  isHighlight: boolean;
  publicationState: DraftState;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An achievement in the published projection. */
export interface PublishedAchievement {
  id: string;
  releaseId: string;
  title: string;
  description: string | null;
  category: AchievementCategory;
  earnedOn: string | null;
  iconMediaId: string | null;
  publishedAt: string;
}

/** A timeline entry in the published projection. */
export interface PublishedTimelineEntry {
  id: string;
  releaseId: string;
  title: string;
  body: string | null;
  kind: TimelineKind;
  occurredOn: string;
  mediaId: string | null;
  isHighlight: boolean;
  publishedAt: string;
}

/** The active release pointer (public-safe fields only). */
export interface ActiveRelease {
  id: string;
  name: string;
  publishedAt: string | null;
  updatedAt: string;
}

/**
 * The complete published snapshot the public site renders from. Every public
 * page/route reads through {@link PublishedRelease}; the draft tables are never
 * queried on the public read path.
 */
export interface PublishedRelease {
  release: ActiveRelease;
  heroes: PublishedHero[];
  skins: PublishedSkin[];
  achievements: PublishedAchievement[];
  timelineEntries: PublishedTimelineEntry[];
}

/** Convenience labels for a draft row's lifecycle state. */
export const DRAFT_STATE_LABELS: Record<DraftState, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/**
 * A publication transition the service controls. These are transitions of a
 * draft row's *lifecycle marker*, not the act of publishing a release (which is
 * task 04-06).
 */
export type DraftTransition = "publish" | "unpublish" | "archive" | "restore";

/**
 * Allowed draft lifecycle transitions, keyed by table. Encoding them as data
 * (rather than a chain of `if`s spread across route handlers) keeps one
 * business rule in one place and makes table availability discoverable.
 * `restore` returns an archived row to `draft`; it never jumps straight to
 * `published`.
 *
 * Only tables whose draft rows carry a `publication_state` column appear here.
 * Achievements and timeline entries share the same lifecycle, so all four state
 * the identical map; `account_stats`/`appearance_settings`/`homepage_sections`
 * are configuration rows without `archived_at` and are therefore not
 * transitionable.
 */
const DRAFT_TRANSITIONS: Record<DraftState, Partial<Record<DraftTransition, DraftState>>> = {
  draft: { publish: "published", archive: "archived" },
  published: { unpublish: "draft", archive: "archived" },
  archived: { restore: "draft" },
};

/** Returns the next state for a transition, or `null` when it is not allowed. */
export function resolveDraftTransition(
  from: DraftState,
  transition: DraftTransition
): DraftState | null {
  return DRAFT_TRANSITIONS[from][transition] ?? null;
}

/** Lists the transitions currently legal from a given draft state. */
export function allowedTransitions(from: DraftState): DraftTransition[] {
  return Object.keys(DRAFT_TRANSITIONS[from]) as DraftTransition[];
}
