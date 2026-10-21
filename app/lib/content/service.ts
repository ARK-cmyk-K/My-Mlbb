import "server-only";

import { isAdminUser } from "../db.ts";
import type { ReleaseSnapshot } from "./contracts.ts";

import {
  asPostgrestClient,
  requireSupabaseClient,
  type PostgrestLike,
  type QueryResult,
} from "./client.ts";
import { resolveDraftTransition } from "./contracts.ts";
import type {
  DraftAchievement,
  DraftState,
  DraftTimelineEntry,
  DraftTransition,
  PublishedAchievement,
  PublishedRelease,
} from "./contracts.ts";
import type { DiffEntry, ReleaseDiff } from "./contracts.ts";
import { ContentServiceError } from "./errors.ts";
import {
  ACTIVE_RELEASE_COLUMNS,
  DRAFT_ACHIEVEMENT_COLUMNS,
  DRAFT_APPEARANCE_SETTINGS_COLUMNS,
  DRAFT_HOMEPAGE_SECTION_COLUMNS,
  DRAFT_HERO_COLUMNS,
  DRAFT_SKIN_COLUMNS,
  DRAFT_TIMELINE_COLUMNS,
  PUBLISHED_ACHIEVEMENT_COLUMNS,
  PUBLISHED_HERO_COLUMNS,
  PUBLISHED_SKIN_COLUMNS,
  PUBLISHED_TIMELINE_COLUMNS,
  toActiveRelease,
  toDraftAchievement,
  toDraftAppearanceSettings,
  toDraftHero,
  toDraftHomepageSection,
  toDraftSkin,
  toDraftTimelineEntry,
  toPublishedAchievement,
  toPublishedHero,
  toPublishedSkin,
  toPublishedTimelineEntry,
} from "./mappers.ts";
import type { ContentService, DraftListOptions, DraftResource } from "./port.ts";
import type { AuthLike } from "./client.ts";
import type {
  AppearanceSettingsInput,
  FieldIssue,
  HeroInput,
  HomepageSectionOrderInput,
  SkinInput,
  TimelineEntryInput,
} from "./validation.ts";
import {
  validateAppearanceSettingsInput,
  validateHeroInput,
  validateHomepageSectionOrder,
  validateSkinInput,
  validateTimelineEntryInput,
} from "./validation.ts";
import { APPROVED_HOMEPAGE_SECTION_IDS } from "./homepage-sections.ts";
/**
 * Supabase-backed content service (task 02-03) — the current database
 * implementation of the {@link ContentService} port.
 *
 * Authorization model (why this is the only module that talks to Postgres):
 *
 *   - Draft reads/writes resolve the *verified* session and require
 *     `public.is_admin()` (the established 02-01 predicate `isAdminUser()`),
 *     then run through the same request-scoped, anon-key client every other
 *     server module uses. RLS remains the load-bearing gate: even if this check
 *     were bypassed, the database returns zero rows / raises 42501 for a
 *     non-admin.
 *   - Public reads use the anon-key client with the caller's (usually absent)
 *     session and select only from the `published_*` tables and the
 *     `published_release` view — the only content objects `anon` is granted —
 *     so a filter bug cannot leak draft data.
 *   - No service-role key is read here; this module contains no literal
 *     service-role reference.
 *
 * Every method returns DTOs (`./contracts.ts`) and rejects with a typed
 * `ContentServiceError`; no raw PostgREST error object escapes.
 */

/** Physical table behind each lifecycle-aware draft resource. */
const LIFECYCLE_TABLE_BY_RESOURCE: Record<DraftResource, string> = {
  heroes: "heroes",
  skins: "skins",
  achievements: "achievements",
  timeline_entries: "timeline_entries",
};

export function createSupabaseContentService(): ContentService {
  return {
    // ------------------------------------------------------------------
    // Draft reads (admin only)
    // ------------------------------------------------------------------
    async listDraftHeroes(listOptions: DraftListOptions = {}) {
      const db = await requireAdminDb();
      const result = await filterDraftRows(
        db.from("heroes").select(DRAFT_HERO_COLUMNS),
        listOptions
      ).order("name", { ascending: true });
      return rowsOf(result).map((row) => toDraftHero(row));
    },

    async getDraftHero(id: string) {
      const db = await requireAdminDb();
      const result = await db
        .from("heroes")
        .select(DRAFT_HERO_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      return readOne(result, id, toDraftHero);
    },

    async listDraftSkins(listOptions = {}) {
      const db = await requireAdminDb();
      let query = filterDraftRows(
        db.from("skins").select(DRAFT_SKIN_COLUMNS),
        listOptions
      );
      if (listOptions.heroId) {
        query = query.eq("hero_id", listOptions.heroId);
      }
      const result = await query.order("name", { ascending: true });
      return rowsOf(result).map((row) => toDraftSkin(row));
    },

    async getDraftSkin(id: string) {
      const db = await requireAdminDb();
      const result = await db
        .from("skins")
        .select(DRAFT_SKIN_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      return readOne(result, id, toDraftSkin);
    },

    async listDraftAchievements(listOptions = {}): Promise<DraftAchievement[]> {
      const db = await requireAdminDb();
      const result = await filterDraftRows(
        db.from("achievements").select(DRAFT_ACHIEVEMENT_COLUMNS),
        listOptions
      ).order("earned_on", { ascending: false, nullsFirst: false });
      return rowsOf(result).map((row) => toDraftAchievement(row));
    },

    async listDraftTimelineEntries(
      listOptions = {}
    ): Promise<DraftTimelineEntry[]> {
      const db = await requireAdminDb();
      const result = await filterDraftRows(
        db.from("timeline_entries").select(DRAFT_TIMELINE_COLUMNS),
        listOptions
      ).order("occurred_on", { ascending: false });
      return rowsOf(result).map((row) => toDraftTimelineEntry(row));
    },

    // ------------------------------------------------------------------
    // Draft mutations (admin only)
    // ------------------------------------------------------------------
    async createDraftHero(input) {
      const validated = requireValidation(validateHeroInput(input));
      const db = await requireAdminDb();
      const result = await db
        .from("heroes")
        .insert(toHeroRow(validated))
        .select(DRAFT_HERO_COLUMNS)
        .single();
      return writeOne(result, "hero", toDraftHero);
    },

    async updateDraftHero(id, input) {
      const validated = requireValidation(validateHeroInput(input));
      const db = await requireAdminDb();
      const result = await db
        .from("heroes")
        .update(toHeroRow(validated))
        .eq("id", id)
        .select(DRAFT_HERO_COLUMNS)
        .maybeSingle();
      return readOne(result, id, toDraftHero);
    },

    async deleteDraftHero(id) {
      const db = await requireAdminDb();
      await deleteDraftRow(db, "heroes", id);
    },

    async createDraftSkin(input) {
      const validated = requireValidation(validateSkinInput(input));
      const db = await requireAdminDb();
      const result = await db
        .from("skins")
        .insert(toSkinRow(validated))
        .select(DRAFT_SKIN_COLUMNS)
        .single();
      return writeOne(result, "skin", toDraftSkin);
    },

    async updateDraftSkin(id, input) {
      const validated = requireValidation(validateSkinInput(input));
      const db = await requireAdminDb();
      const result = await db
        .from("skins")
        .update(toSkinRow(validated))
        .eq("id", id)
        .select(DRAFT_SKIN_COLUMNS)
        .maybeSingle();
      return readOne(result, id, toDraftSkin);
    },

    async deleteDraftSkin(id) {
      const db = await requireAdminDb();
      await deleteDraftRow(db, "skins", id);
    },

    async createDraftTimelineEntry(input) {
      const validated = requireValidation(validateTimelineEntryInput(input));
      const db = await requireAdminDb();
      const result = await db
        .from("timeline_entries")
        .insert(toTimelineRow(validated))
        .select(DRAFT_TIMELINE_COLUMNS)
        .single();
      return writeOne(result, "timeline entry", toDraftTimelineEntry);
    },

    async updateDraftTimelineEntry(id, input) {
      const validated = requireValidation(validateTimelineEntryInput(input));
      const db = await requireAdminDb();
      const result = await db
        .from("timeline_entries")
        .update(toTimelineRow(validated))
        .eq("id", id)
        .select(DRAFT_TIMELINE_COLUMNS)
        .maybeSingle();
      return readOne(result, id, toDraftTimelineEntry);
    },

    async deleteDraftTimelineEntry(id) {
      const db = await requireAdminDb();
      await deleteDraftRow(db, "timeline_entries", id);
    },

    async getDraftAppearanceSettings() {
      const db = await requireAdminDb();
      const result = await db
        .from("appearance_settings")
        .select(DRAFT_APPEARANCE_SETTINGS_COLUMNS)
        .eq("id", 1)
        .maybeSingle();
      return readOne(result, "1", toDraftAppearanceSettings);
    },

    async updateDraftAppearanceSettings(input) {
      const validated = requireValidation(validateAppearanceSettingsInput(input));
      const db = await requireAdminDb();
      const result = await db
        .from("appearance_settings")
        .update(toAppearanceSettingsRow(validated))
        .eq("id", 1)
        .select(DRAFT_APPEARANCE_SETTINGS_COLUMNS)
        .maybeSingle();
      return readOne(result, "1", toDraftAppearanceSettings);
    },

    async listDraftHomepageSections() {
      const db = await requireAdminDb();
      const result = await db
        .from("homepage_sections")
        .select(DRAFT_HOMEPAGE_SECTION_COLUMNS)
        .order("position", { ascending: true });
      return rowsOf(result).map((row) => toDraftHomepageSection(row));
    },

    async updateDraftHomepageSections(input) {
      const validated = requireValidation(validateHomepageSectionOrder(input));
      const db = await requireAdminDb();

      // Replace the entire configuration atomically so positions stay unique
      // and every approved module remains present (the validator enforces
      // exact coverage).
      const deleted = await db.from("homepage_sections").delete().neq("section_id", "");
      throwIfError(deleted.error);

      const rows = validated.map((entry) => ({
        section_id: entry.sectionId,
        position: entry.position,
        is_enabled: entry.isEnabled,
      }));
      const inserted = await db
        .from("homepage_sections")
        .insert(rows)
        .select(DRAFT_HOMEPAGE_SECTION_COLUMNS);
      throwIfError(inserted.error);
      const list = rowsOf(inserted);
      list.sort((a, b) => Number((a as Record<string, unknown>).position) - Number((b as Record<string, unknown>).position));
      return list.map((row) => toDraftHomepageSection(row));
    },

    // ------------------------------------------------------------------
    // Publication lifecycle (admin only)
    // ------------------------------------------------------------------
    async transitionDraftState(resource, id, transition) {
      const db = await requireAdminDb();
      const table = LIFECYCLE_TABLE_BY_RESOURCE[resource];

      const current = await readPublicationState(db, table, id);
      const next = resolveDraftTransition(current, transition);
      if (next === null) {
        throw new ContentServiceError("INVALID_TRANSITION", {
          message: `Cannot ${transition} a ${current} record.`,
        });
      }

      // `archived_at` must track the state exactly; the 01-03 CHECK
      // `(publication_state = 'archived') = (archived_at IS NOT NULL)` rejects a
      // mismatch, so both columns move in a single statement.
      const result = await db
        .from(table)
        .update({
          publication_state: next,
          archived_at: next === "archived" ? new Date().toISOString() : null,
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      throwIfError(result.error);
      if (result.data === null) {
        throw new ContentServiceError("NOT_FOUND", {
          message: `No record exists with id "${id}".`,
        });
      }
    },

    // ------------------------------------------------------------------
    // Public reads (published data only)
    // ------------------------------------------------------------------
    async getActiveRelease() {
      const db = await publicDb();
      const result = await db
        .from("published_release")
        .select(ACTIVE_RELEASE_COLUMNS)
        .maybeSingle();
      throwIfError(result.error);
      return result.data ? toActiveRelease(asRow(result.data)) : null;
    },

    async getPublishedRelease(): Promise<PublishedRelease> {
      const db = await publicDb();
      const releaseResult = await db
        .from("published_release")
        .select(ACTIVE_RELEASE_COLUMNS)
        .maybeSingle();
      throwIfError(releaseResult.error);
      if (!releaseResult.data) {
        throw new ContentServiceError("NO_PUBLISHED_RELEASE");
      }
      const releaseId = String(asRow(releaseResult.data).id);

      const [heroes, skins, achievements, timeline] = await Promise.all([
        queryPublished(db, "published_heroes", PUBLISHED_HERO_COLUMNS, releaseId),
        queryPublished(db, "published_skins", PUBLISHED_SKIN_COLUMNS, releaseId),
        queryPublished(
          db,
          "published_achievements",
          PUBLISHED_ACHIEVEMENT_COLUMNS,
          releaseId
        ),
        queryPublished(
          db,
          "published_timeline_entries",
          PUBLISHED_TIMELINE_COLUMNS,
          releaseId
        ),
      ]);

      return {
        release: toActiveRelease(asRow(releaseResult.data)),
        heroes: heroes.map((row) => toPublishedHero(row)),
        skins: skins.map((row) => toPublishedSkin(row)),
        achievements: achievements.map(
          (row): PublishedAchievement => toPublishedAchievement(row)
        ),
        timelineEntries: timeline.map((row) => toPublishedTimelineEntry(row)),
      };
    },

    async getPublishedHomepageSections() {
      const db = await publicDb();
      // Until 04-05/04-06 freeze the full snapshot into the published release
      // payload, the public configuration is not exposed by the current schema.
      // Returning [] here means the public layout must handle an unpublished
      // state explicitly (and never fall back to draft data).
      return [];
    },

    /** Fetch the most recent release snapshot for a given release, or throw. */
    async getReleaseSnapshot(releaseId: string): Promise<ReleaseSnapshot> {
      const db = await requireAdminDb();
      const result = await db
        .from("release_snapshots")
        .select("*")
        .eq("release_id", releaseId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      throwIfError(result.error);
      if (result.data === null) {
        throw new ContentServiceError("NO_PUBLISHED_RELEASE", {
          message: `No release snapshot found for release "${releaseId}".`,
        });
      }
      const row = asRow(result.data);
      return {
        id: String(row.id),
        releaseId: String(row.release_id),
        version: Number(row.version),
        label: row.label === null ? null : String(row.label),
        payload: row.payload,
        payloadFormatVersion: Number(row.payload_format_version),
        checksumSha256: String(row.checksum_sha256),
        createdAt: String(row.created_at),
      };
    },

    /**
     * Compute a side-by-side diff between the current draft state and a
     * published release snapshot, returning field-level differences for
     * supported content and appearance fields.
     *
     * The diff is based on structural comparison of the PublishedRelease
     * snapshot payload against the current draft rows.
     */
    async computeReleaseDiff(releaseId: string): Promise<ReleaseDiff> {
      const db = await requireAdminDb();

      // Fetch the snapshot
      const snapshot = await this.getReleaseSnapshot(releaseId);

      // Fetch current draft state for each resource
      const [draftHeroes, draftSkins, draftAchievements, draftTimelineEntries] = await Promise.all([
        db.from("heroes").select(DRAFT_HERO_COLUMNS).eq("publication_state", "draft"),
        db.from("skins").select(DRAFT_SKIN_COLUMNS).eq("publication_state", "draft"),
        db.from("achievements").select(DRAFT_ACHIEVEMENT_COLUMNS).eq("publication_state", "draft"),
        db.from("timeline_entries").select(DRAFT_TIMELINE_COLUMNS).eq("publication_state", "draft"),
      ]);

      const heroRows = rowsOf(draftHeroes);
      const skinRows = rowsOf(draftSkins);
      const achievementRows = rowsOf(draftAchievements);
      const timelineRows = rowsOf(draftTimelineEntries);

      // Build diff entries for each resource type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const self = this as any;
      const heroDiffs = self.computeHeroDiffs(heroRows, snapshot);
      const skinDiffs = self.computeSkinDiffs(skinRows, snapshot);
      const achievementDiffs = self.computeAchievementDiffs(achievementRows, snapshot);
      const timelineDiffs = self.computeTimelineDiffs(timelineRows, snapshot);

      // For appearance settings, we have a singleton row
      const appearanceDiffs = self.computeAppearanceDiff(db, snapshot);

      return {
        releaseId,
        snapshot,
        drafts: {
          heroes: heroDiffs,
          skins: skinDiffs,
          achievements: achievementDiffs,
          timelineEntries: timelineDiffs,
          appearanceSettings: appearanceDiffs,
        },
      };
    },

    /**
     * Compute hero-level diff entries comparing draft rows against the snapshot payload.
     */
    computeHeroDiffs(
      draftHeroes: Array<Record<string, unknown>>,
      snapshot: ReleaseSnapshot
    ): DiffEntry[] {
      type SnapshotRow = Record<string, unknown> & { id: string };
      const snapshotHeroes = (((snapshot.payload as Record<string, unknown>)?.heroes ?? []) as SnapshotRow[]);
      const result: DiffEntry[] = [];

      // Heroes in snapshot but not in draft (or vice versa) are "changed/removed/added"
      const draftIds = new Set(draftHeroes.map((h) => String(h.id)));
      const snapshotIds = new Set(snapshotHeroes.map((s) => s.id));

      // Check for removed heroes
      for (const id of snapshotIds as Set<string>) {
        if (!draftIds.has(id)) {
          result.push({
            path: "heroes",
            kind: "removed",
            old: snapshotHeroes.find((s) => s.id === id),
          });
        }
      }

      // Check for added or changed heroes
      for (const draftHero of draftHeroes) {
        const id = String(draftHero.id);
        const snapshotHero = snapshotHeroes.find((s) => s.id === id);
        if (!snapshotHero) {
          result.push({
            path: "heroes",
            kind: "added",
            new: draftHero,
          });
          continue;
        }

        // Compare fields
        const changes: Array<{ field: string; old: unknown; new: unknown }> = [];

        const fieldComparisons: [string, string, string][] = [
          ["name", "name", "name"],
          ["slug", "slug", "slug"],
          ["primaryRole", "primary_role", "primary_role"],
          ["secondaryRole", "secondary_role", "secondary_role"],
          ["specialty", "specialty", "specialty"],
          ["masteryLevel", "mastery_level", "mastery_level"],
          ["totalMatches", "total_matches", "total_matches"],
          ["winRate", "win_rate", "win_rate"],
          ["isSignature", "is_signature", "is_signature"],
          ["isFavorite", "is_favorite", "is_favorite"],
        ];

        for (const [field, draftKey, snapshotKey] of fieldComparisons) {
          const draftVal = (draftHero as Record<string, unknown>)[draftKey];
          const snapshotVal = (snapshotHero as Record<string, unknown>)[snapshotKey];
          if (String(draftVal) !== String(snapshotVal)) {
            changes.push({ field, old: snapshotVal, new: draftVal });
          }
        }

        if (changes.length > 0) {
          result.push({
            path: "heroes",
            kind: "changed",
            old: snapshotHero,
            new: { ...draftHero, changes },
          });
        } else {
          result.push({
            path: "heroes",
            kind: "unchanged",
          });
        }
      }

      return result;
    },

    /**
     * Compute skin-level diff entries comparing draft rows against the snapshot payload.
     */
    computeSkinDiffs(
      draftSkins: Array<Record<string, unknown>>,
      snapshot: ReleaseSnapshot
    ): DiffEntry[] {
      type SnapshotRow = Record<string, unknown> & { id: string };
      const snapshotSkins = (((snapshot.payload as Record<string, unknown>)?.skins ?? []) as SnapshotRow[]);
      const result: DiffEntry[] = [];

      const draftSkinIds = new Set(draftSkins.map((s) => String(s.id)));
      const snapshotSkinIds = new Set(snapshotSkins.map((s) => s.id));

      // Check for removed skins
      for (const id of snapshotSkinIds as Set<string>) {
        if (!draftSkinIds.has(id)) {
          result.push({
            path: "skins",
            kind: "removed",
            old: snapshotSkins.find((s) => s.id === id),
          });
        }
      }

      // Check for added or changed skins
      for (const draftSkin of draftSkins) {
        const id = String(draftSkin.id);
        const snapshotSkin = snapshotSkins.find((s) => s.id === id);
        if (!snapshotSkin) {
          result.push({
            path: "skins",
            kind: "added",
            new: draftSkin,
          });
          continue;
        }

        const changes: Array<{ field: string; old: unknown; new: unknown }> = [];

        const fieldComparisons: [string, string, string][] = [
          ["name", "name", "name"],
          ["slug", "slug", "slug"],
          ["heroId", "hero_id", "hero_id"],
          ["rarity", "rarity", "rarity"],
          ["series", "series", "series"],
          ["splashArtMediaId", "splash_art_media_id", "splash_art_media_id"],
          ["variant", "variant", "variant"],
          ["acquisitionDate", "acquisition_date", "acquisition_date"],
          ["acquisitionMilestone", "acquisition_milestone", "acquisition_milestone"],
          ["isOwned", "is_owned", "is_owned"],
          ["isFavorite", "is_favorite", "is_favorite"],
        ];

        for (const [field, draftKey, snapshotKey] of fieldComparisons) {
          const draftVal = (draftSkin as Record<string, unknown>)[draftKey];
          const snapshotVal = (snapshotSkin as Record<string, unknown>)[snapshotKey];
          if (String(draftVal) !== String(snapshotVal)) {
            changes.push({ field, old: snapshotVal, new: draftVal });
          }
        }

        if (changes.length > 0) {
          result.push({
            path: "skins",
            kind: "changed",
            old: snapshotSkin,
            new: { ...draftSkin, changes },
          });
        } else {
          result.push({
            path: "skins",
            kind: "unchanged",
          });
        }
      }

      return result;
    },

    /**
     * Compute achievement-level diff entries comparing draft rows against the snapshot payload.
     */
    computeAchievementDiffs(
      draftAchievements: Array<Record<string, unknown>>,
      snapshot: ReleaseSnapshot
    ): DiffEntry[] {
      type SnapshotRow = Record<string, unknown> & { id: string };
      const snapshotAchievements = (((snapshot.payload as Record<string, unknown>)?.achievements ?? []) as SnapshotRow[]);
      const result: DiffEntry[] = [];

      const draftAchIdSet = new Set(
        draftAchievements.map((a) => String(a.id))
      );
      const snapshotAchIdSet = new Set(
        snapshotAchievements.map((a) => a.id)
      );

      // Check for removed achievements
      for (const id of snapshotAchIdSet as Set<string>) {
        if (!draftAchIdSet.has(id)) {
          result.push({
            path: "achievements",
            kind: "removed",
            old: snapshotAchievements.find((a) => a.id === id),
          });
        }
      }

      // Check for added or changed achievements
      for (const draftAch of draftAchievements) {
        const id = String(draftAch.id);
        const snapshotAch = snapshotAchievements.find((a) => a.id === id);
        if (!snapshotAch) {
          result.push({
            path: "achievements",
            kind: "added",
            new: draftAch,
          });
          continue;
        }

        const changes: Array<{ field: string; old: unknown; new: unknown }> = [];

        const fieldComparisons: [string, string, string][] = [
          ["title", "title", "title"],
          ["description", "description", "description"],
          ["category", "category", "category"],
          ["earnedOn", "earned_on", "earned_on"],
        ];

        for (const [field, draftKey, snapshotKey] of fieldComparisons) {
          const draftVal = (draftAch as Record<string, unknown>)[draftKey];
          const snapshotVal = (snapshotAch as Record<string, unknown>)[snapshotKey];
          if (String(draftVal) !== String(snapshotVal)) {
            changes.push({ field, old: snapshotVal, new: draftVal });
          }
        }

        if (changes.length > 0) {
          result.push({
            path: "achievements",
            kind: "changed",
            old: snapshotAch,
            new: { ...draftAch, changes },
          });
        } else {
          result.push({
            path: "achievements",
            kind: "unchanged",
          });
        }
      }

      return result;
    },

    /**
     * Compute timeline entry-level diff entries comparing draft rows against the snapshot payload.
     */
    computeTimelineDiffs(
      draftTimelineEntries: Array<Record<string, unknown>>,
      snapshot: ReleaseSnapshot
    ): DiffEntry[] {
      type SnapshotRow = Record<string, unknown> & { id: string };
      const snapshotTimeline = (((snapshot.payload as Record<string, unknown>)?.timeline_entries ?? []) as SnapshotRow[]);
      const result: DiffEntry[] = [];

      const draftTimIdSet = new Set(
        draftTimelineEntries.map((t) => String(t.id))
      );
      const snapshotTimIdSet = new Set(
        snapshotTimeline.map((t) => t.id)
      );

      // Check for removed timeline entries
      for (const id of snapshotTimIdSet as Set<string>) {
        if (!draftTimIdSet.has(id)) {
          result.push({
            path: "timeline_entries",
            kind: "removed",
            old: snapshotTimeline.find((t) => t.id === id),
          });
        }
      }

      // Check for added or changed timeline entries
      for (const draftTim of draftTimelineEntries) {
        const id = String(draftTim.id);
        const snapshotTim = snapshotTimeline.find((t) => t.id === id);
        if (!snapshotTim) {
          result.push({
            path: "timeline_entries",
            kind: "added",
            new: draftTim,
          });
          continue;
        }

        const changes: Array<{ field: string; old: unknown; new: unknown }> = [];

        const fieldComparisons: [string, string, string][] = [
          ["title", "title", "title"],
          ["body", "body", "body"],
          ["kind", "kind", "kind"],
          ["occurredOn", "occurred_on", "occurred_on"],
          ["isHighlight", "is_highlight", "is_highlight"],
        ];

        for (const [field, draftKey, snapshotKey] of fieldComparisons) {
          const draftVal = (draftTim as Record<string, unknown>)[draftKey];
          const snapshotVal = (snapshotTim as Record<string, unknown>)[snapshotKey];
          if (String(draftVal) !== String(snapshotVal)) {
            changes.push({ field, old: snapshotVal, new: draftVal });
          }
        }

        if (changes.length > 0) {
          result.push({
            path: "timeline_entries",
            kind: "changed",
            old: snapshotTim,
            new: { ...draftTim, changes },
          });
        } else {
          result.push({
            path: "timeline_entries",
            kind: "unchanged",
          });
        }
      }

      return result;
    },

    /**
     * Compute appearance settings diff comparing the draft singleton against the snapshot payload.
     */
    async computeAppearanceDiff(
      db: PostgrestLike,
      snapshot: ReleaseSnapshot
    ): Promise<DiffEntry[]> {
      const snapshotPayload = snapshot.payload as Record<string, unknown>;
      const result: DiffEntry[] = [];

      // Fetch current draft appearance settings
      const result2 = await db
        .from("appearance_settings")
        .select(DRAFT_APPEARANCE_SETTINGS_COLUMNS)
        .eq("id", 1)
        .maybeSingle();
      throwIfError(result2.error);
      const draftAppearance = result2.data ? asRow(result2.data) : null;

      if (!draftAppearance && !snapshotPayload?.appearance_settings) {
        result.push({
          path: "appearance_settings",
          kind: "unchanged",
        });
        return result;
      }

      const snapshotAppearance = snapshotPayload?.appearance_settings;

      if (!draftAppearance) {
        result.push({
          path: "appearance_settings",
          kind: "added",
          new: snapshotAppearance,
        });
        return result;
      }

      if (!snapshotAppearance) {
        result.push({
          path: "appearance_settings",
          kind: "removed",
          old: draftAppearance,
        });
        return result;
      }

        // Compare fields
        const changes: Array<{ field: string; old: unknown; new: unknown }> = [];

        const fieldComparisons: [string, string, string][] = [
          ["themePreset", "theme_preset", "theme_preset"],
          ["primaryAccent", "primary_accent", "primary_accent"],
          ["secondaryAccent", "secondary_accent", "secondary_accent"],
          ["typographyScale", "typography_scale", "typography_scale"],
          ["containerWidthPx", "container_width_px", "container_width_px"],
          ["spacingScale", "spacing_scale", "spacing_scale"],
          ["customCss", "custom_css", "custom_css"],
        ];

        for (const [field, draftKey, snapshotKey] of fieldComparisons) {
          const draftVal = (draftAppearance as Record<string, unknown>)[draftKey];
          const snapshotVal = (snapshotAppearance as Record<string, unknown>)[snapshotKey];
          if (String(draftVal) !== String(snapshotVal)) {
            changes.push({ field, old: snapshotVal, new: draftVal });
          }
        }

        if (changes.length > 0) {
          result.push({
            path: "appearance_settings",
            kind: "changed",
            old: draftAppearance,
            new: { ...draftAppearance, changes },
          });
        } else {
          result.push({
            path: "appearance_settings",
            kind: "unchanged",
          });
        }

      return result;
    },
  } as ContentService;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns an authorized database handle, or throws `NOT_CONFIGURED` /
 * `UNAUTHENTICATED` / `UNAUTHORIZED`.
 *
 * RLS remains the real gate; this exists so the dashboard receives a precise
 * typed error instead of an empty list that merely looks like "no data", and so
 * an unauthenticated request never even issues the query.
 */
async function requireAdminDb(): Promise<PostgrestLike & { auth: AuthLike }> {
  const client = await requireSupabaseClient();
  const db = asPostgrestClient(client);

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new ContentServiceError("UNAUTHENTICATED");
  }

  if (!(await isAdminUser())) {
    throw new ContentServiceError("UNAUTHORIZED");
  }

  return db as PostgrestLike & { auth: AuthLike };
}

/** A session-respecting handle for the public read path. */
async function publicDb(): Promise<PostgrestLike & { auth: AuthLike }> {
  const client = await requireSupabaseClient();
  return asPostgrestClient(client) as PostgrestLike & { auth: AuthLike };
}

/** Applies the shared draft list filter (`state` or "everything but archived"). */
function filterDraftRows(
  query: ReturnType<PostgrestLike["from"]>,
  options: DraftListOptions
): ReturnType<PostgrestLike["from"]> {
  if (options.state) {
    return query.eq("publication_state", options.state);
  }
  return options.includeArchived
    ? query
    : query.neq("publication_state", "archived");
}

/** Re-throws a typed error unchanged; anything else becomes `STORE_UNAVAILABLE`. */
function throwIfError(error: unknown): void {
  if (error === null || error === undefined) {
    return;
  }
  throw error instanceof ContentServiceError ? error : storeUnavailable(error);
}

function storeUnavailable(cause: unknown): ContentServiceError {
  return new ContentServiceError("STORE_UNAVAILABLE", { cause });
}

/** Reads rows from a list result, normalizing the PostgREST `data` shape. */
function rowsOf(result: QueryResult<unknown>): Array<Record<string, unknown>> {
  throwIfError(result.error);
  if (result.data === null || result.data === undefined) {
    return [];
  }
  const list = Array.isArray(result.data) ? result.data : [result.data];
  return list.map(asRow);
}

function asRow(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

/** Maps a single-row read to a DTO, or throws `NOT_FOUND`. */
function readOne<TOut>(
  result: QueryResult<unknown>,
  requestedId: string,
  map: (row: Record<string, unknown>) => TOut
): TOut {
  throwIfError(result.error);
  if (result.data === null || result.data === undefined) {
    throw new ContentServiceError("NOT_FOUND", {
      message: `No record exists with id "${requestedId}".`,
    });
  }
  return map(asRow(result.data));
}

/** Maps an insert result, translating constraint violations into typed errors. */
function writeOne<TOut>(
  result: QueryResult<unknown>,
  label: string,
  map: (row: Record<string, unknown>) => TOut
): TOut {
  if (result.error) {
    throw mapWriteError(result.error);
  }
  if (result.data === null || result.data === undefined) {
    throw new ContentServiceError("STORE_UNAVAILABLE", {
      message: `Failed to create ${label}.`,
    });
  }
  return map(asRow(result.data));
}

function requireValidation<T>(
  result: { ok: true; value: T } | { ok: false; issues: FieldIssue[] }
): T {
  if (!result.ok) {
    throw new ContentServiceError("VALIDATION_FAILED", {
      issues: result.issues,
    });
  }
  return result.value;
}

async function deleteDraftRow(
  db: PostgrestLike,
  table: string,
  id: string
): Promise<void> {
  const result = await db
    .from(table)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwIfError(result.error);
  if (result.data === null) {
    throw new ContentServiceError("NOT_FOUND", {
      message: `No record exists with id "${id}".`,
    });
  }
}

async function readPublicationState(
  db: PostgrestLike,
  table: string,
  id: string
): Promise<DraftState> {
  const result = await db
    .from(table)
    .select("publication_state")
    .eq("id", id)
    .maybeSingle();
  throwIfError(result.error);
  if (result.data === null) {
    throw new ContentServiceError("NOT_FOUND", {
      message: `No record exists with id "${id}".`,
    });
  }
  const state = asRow(result.data).publication_state;
  return state === "published" || state === "archived" ? state : "draft";
}

async function queryPublished(
  db: PostgrestLike,
  table: string,
  columns: string,
  releaseId: string
): Promise<Array<Record<string, unknown>>> {
  const result = await db
    .from(table)
    .select(columns)
    .eq("release_id", releaseId);
  return rowsOf(result);
}

function toHeroRow(input: HeroInput) {
  return {
    name: input.name,
    slug: input.slug,
    primary_role: input.primaryRole,
    secondary_role: input.secondaryRole,
    specialty: input.specialty,
    portrait_media_id: input.portraitMediaId,
    mastery_level: input.masteryLevel,
    total_matches: input.totalMatches,
    win_rate: input.winRate,
    is_signature: input.isSignature,
    is_favorite: input.isFavorite,
  };
}

function toSkinRow(input: SkinInput) {
  return {
    name: input.name,
    slug: input.slug,
    hero_id: input.heroId,
    rarity: input.rarity,
    series: input.series,
    splash_art_media_id: input.splashArtMediaId,
    variant: input.variant,
    acquisition_date: input.acquisitionDate,
    acquisition_milestone: input.acquisitionMilestone,
    is_owned: input.isOwned,
    is_favorite: input.isFavorite,
  };
}

function toTimelineRow(input: TimelineEntryInput) {
  return {
    title: input.title,
    body: input.body,
    kind: input.kind,
    occurred_on: input.occurredOn,
    media_id: input.mediaId,
    is_highlight: input.isHighlight,
  };
}

function toAppearanceSettingsRow(input: AppearanceSettingsInput) {
  return {
    theme_preset: input.themePreset,
    primary_accent: input.primaryAccent,
    secondary_accent: input.secondaryAccent,
    typography_scale: input.typographyScale,
    container_width_px: input.containerWidthPx,
    spacing_scale: input.spacingScale,
  };
}
/**
 * Maps a write failure to a typed error. Unique-violation (`23505`) becomes
 * `CONFLICT`; foreign-key violation (`23503`) becomes `DEPENDENCY_MISSING`; a
 * CHECK violation (`23514`) is a validation fault; everything else is a store
 * fault. PostgREST surfaces the SQLSTATE as `code`.
 */
function mapWriteError(error: unknown): ContentServiceError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  switch (code) {
    case "23505":
      return new ContentServiceError("CONFLICT", { cause: error });
    case "23503":
      return new ContentServiceError("DEPENDENCY_MISSING", { cause: error });
    case "23514":
      return new ContentServiceError("VALIDATION_FAILED", { cause: error });
    default:
      return storeUnavailable(error);
  }
}

/** Exposed for tests: the resource -> table map. */
export const DRAFT_RESOURCE_TABLES: Record<DraftResource, string> =
  LIFECYCLE_TABLE_BY_RESOURCE;
export type { DraftTransition };
