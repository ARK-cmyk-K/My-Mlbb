import type {
  ActiveRelease,
  DraftAchievement,
  DraftHero,
  DraftSkin,
  DraftState,
  DraftTimelineEntry,
  PublishedRelease,
} from "./contracts.ts";
import type {
  HeroInput,
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
}

/** The service factory shape, so callers can accept an injected double. */
export type ContentServiceFactory = () => Promise<ContentService>;
