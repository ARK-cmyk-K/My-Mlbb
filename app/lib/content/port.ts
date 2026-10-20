import type {
  ActiveRelease,
  DraftAchievement,
  DraftAppearanceSettings,
  DraftHero,
  DraftHomepageSection,
  DraftSkin,
  DraftState,
  DraftTimelineEntry,
  PublishedHomepageSection,
  PublishedRelease,
  ReleaseSnapshot,
  ReleaseDiff,
} from "./contracts.ts";
import type {
  AppearanceSettingsInput,
  HeroInput,
  HomepageSectionOrderInput,
  SkinInput,
  TimelineEntryInput,
} from "./validation.ts";
/**
 * The content-service port (task 02-03).
 *
 * This interface is the whole contract the application depends on. Route
 * handlers, Server Actions and UI code import *this*, never the Supabase
 * implementation directly. Two implementations exist:
 *
 *   - {@link createSupabaseContentService} (production): resolves the verified
 *     Supabase session and therefore can only ever return data the caller is
 *     allowed to see (RLS + the public projection).
 *   - `createInMemoryContentService` (tests): a dependency-free double used by
 *     the unit suite when no database is available.
 *
 * The split is what lets the authorization/validation/transition rules be
 * tested without a live project while production still gets real RLS.
 */

/** Which draft table a method operates on. */
export type DraftResource =
  | "heroes"
  | "skins"
  | "achievements"
  | "timeline_entries";

/** Unspecified state means "everything except archived". */
export interface DraftListOptions {
  /** Include `archived` rows. Defaults to false. */
  includeArchived?: boolean;
  /** Restrict to one lifecycle state. */
  state?: DraftState;
}

/**
 * The content service. All methods are server-only and authorize themselves;
 * callers must not pre-authorize on their behalf.
 *
 * Error contract: every method rejects with a `ContentServiceError`.
 */
export interface ContentService {
  // ---- Draft reads (admin only) -------------------------------------------
  /** Lists draft heroes. */
  listDraftHeroes(options?: DraftListOptions): Promise<DraftHero[]>;
  /** Reads one draft hero or rejects with `NOT_FOUND`. */
  getDraftHero(id: string): Promise<DraftHero>;

  /** Lists draft skins, optionally scoped to a hero. */
  listDraftSkins(
    options?: DraftListOptions & { heroId?: string }
  ): Promise<DraftSkin[]>;
  /** Reads one draft skin or rejects with `NOT_FOUND`. */
  getDraftSkin(id: string): Promise<DraftSkin>;

  /** Lists draft achievements. */
  listDraftAchievements(options?: DraftListOptions): Promise<DraftAchievement[]>;

  /** Lists draft timeline entries. */
  listDraftTimelineEntries(
    options?: DraftListOptions
  ): Promise<DraftTimelineEntry[]>;

  /** Reads the singleton draft appearance settings. */
  getDraftAppearanceSettings(): Promise<DraftAppearanceSettings>;
  /** Updates the singleton draft appearance settings. */
  updateDraftAppearanceSettings(
    input: Partial<AppearanceSettingsInput>
  ): Promise<DraftAppearanceSettings>;

  /**
   * Lists the draft homepage-section ordering/visibility rows (task `04-02`),
   * ordered by `position`. Configuration rows: no lifecycle filtering applies.
   */
  listDraftHomepageSections(): Promise<DraftHomepageSection[]>;
  /**
   * Replaces the draft homepage ordering with a complete, validated ordering
   * (task `04-02`). `input` is the approved modules in display order; the
   * service derives `position` from that order and rejects unapproved or
   * duplicate section ids before touching the database.
   */
  updateDraftHomepageSections(
    input: HomepageSectionOrderInput
  ): Promise<DraftHomepageSection[]>;
  // ---- Draft mutations (admin only) ---------------------------------------
  /** Creates a draft hero from validated input. */
  createDraftHero(input: HeroInput): Promise<DraftHero>;
  /** Updates a draft hero; rejects with `NOT_FOUND`/`VALIDATION_FAILED`. */
  updateDraftHero(id: string, input: Partial<HeroInput>): Promise<DraftHero>;
  /** Deletes a draft hero row (hard delete of draft data only). */
  deleteDraftHero(id: string): Promise<void>;

  /** Creates a draft skin. */
  createDraftSkin(input: SkinInput): Promise<DraftSkin>;
  /** Updates a draft skin. */
  updateDraftSkin(id: string, input: Partial<SkinInput>): Promise<DraftSkin>;
  /** Deletes a draft skin row. */
  deleteDraftSkin(id: string): Promise<void>;

  /** Creates a draft timeline entry. */
  createDraftTimelineEntry(
    input: TimelineEntryInput
  ): Promise<DraftTimelineEntry>;
  /** Updates a draft timeline entry. */
  updateDraftTimelineEntry(
    id: string,
    input: Partial<TimelineEntryInput>
  ): Promise<DraftTimelineEntry>;
  /** Deletes a draft timeline entry row. */
  deleteDraftTimelineEntry(id: string): Promise<void>;

  // ---- Publication lifecycle (admin only) ---------------------------------
  /**
   * Moves a draft row through its lifecycle marker (`publish`/`unpublish`/
   * `archive`/`restore`). This does NOT change what the public site serves —
   * that is the release workflow (task 04-06). Rejects with
   * `INVALID_TRANSITION` when the change is not legal.
   */
  transitionDraftState(
    resource: DraftResource,
    id: string,
    transition: import("./contracts").DraftTransition
  ): Promise<void>;

  // ---- Public reads (published data only) ---------------------------------
  /** The single active release, or `null` when nothing is published. */
  getActiveRelease(): Promise<ActiveRelease | null>;
  /**
   * The full published snapshot for the sites to render. Rejects with
   * `NO_PUBLISHED_RELEASE` when nothing has been published yet.
   */
  getPublishedRelease(): Promise<PublishedRelease>;
  /**
   * The published homepage ordering/visibility the public layout composes from
   * (task `04-02`).
   *
   * Contract: published configuration only — the frozen payload of the active
   * release (`04-05` freezes it, `04-06` publishes it). Draft rows are never
   * read here, and "nothing published" is an empty array rather than a fallback
   * to draft state, so the public page can render its unpublished state
   * instead of guessing an order.
   */
  getPublishedHomepageSections(): Promise<PublishedHomepageSection[]>;

  /** Fetch the most recent release snapshot for a given release, or throw. */
  getReleaseSnapshot(releaseId: string): Promise<ReleaseSnapshot>;

  /** Compute a diff between the current draft state and a release snapshot. */
  computeReleaseDiff(releaseId: string): Promise<ReleaseDiff>;
}

/** The service factory shape, so callers can accept an injected double. */
export type ContentServiceFactory = () => Promise<ContentService>;
