import type {
  ActiveRelease,
  DraftAchievement,
  DraftAppearanceSettings,
  DraftHero,
  DraftSkin,
  DraftState,
  DiffEntry,
  DraftTimelineEntry,
  PublishedRelease,
  ReleaseDiff,
  ReleaseSnapshot,
} from "./contracts.ts";
import { resolveDraftTransition } from "./contracts.ts";
import { ContentServiceError } from "./errors.ts";
import type {
  ContentService,
  DraftListOptions,
  DraftResource,
} from "./port.ts";
import {
  validateAppearanceSettingsInput,
  validateHeroInput,
  validateHomepageSectionOrder,
  validateSkinInput,
  validateTimelineEntryInput,
} from "./validation.ts";
import type {
  AppearanceSettingsInput,
  HeroInput,
  HomepageSectionOrderInput,
  SkinInput,
  TimelineEntryInput,
  ValidationResult,
} from "./validation.ts";
import { defaultHomepageSectionConfiguration } from "./homepage-sections.ts";
/**
 * In-memory content-service double (task 02-03).
 *
 * Why it exists: this environment has no local Supabase stack and no hosted
 * project (see PROJECT_STATE.md "Blockers and risks"), so the *authorization,
 * validation and transition* behaviour of the service has to be testable
 * without a database. This double enforces the same rules the Supabase
 * implementation does — the same validators, the same `resolveDraftTransition`
 * map, the same typed errors — and additionally models the fail-closed admin
 * gate so "unauthorized draft reads/writes" are real test cases.
 *
 * It deliberately does NOT re-implement RLS; it is a test seam, never wired into
 * the application. Production always uses `createSupabaseContentService`.
 */

/** Who is making the call. `admin: false` is the fail-closed default. */
export interface InMemoryActor {
  /** Whether a verified session exists at all. */
  authenticated: boolean;
  /** Whether that session is the configured admin. */
  admin: boolean;
  /** Whether Supabase "is configured" in this scenario. */
  configured: boolean;
}

export interface SeedData {
  heroes?: Array<Partial<DraftHero>>;
  skins?: Array<Partial<DraftSkin>>;
  achievements?: Array<Partial<DraftAchievement>>;
  timelineEntries?: Array<Partial<DraftTimelineEntry>>;
  publishedRelease?: PublishedRelease | null;
  homepageSections?: Array<Partial<any>>;
  publishedHomepageSections?: Array<Partial<any>>;
  releaseSnapshots?: Array<Partial<ReleaseSnapshot>>;
}

const UNAUTHENTICATED_ACTOR: InMemoryActor = {
  authenticated: false,
  admin: false,
  configured: true,
};

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString().padStart(4, "0")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Builds a fully-populated draft hero from a (partial) seed. */
function seedHero(seed: Partial<DraftHero>): DraftHero {
  return {
    id: seed.id ?? nextId("hero"),
    name: seed.name ?? "Seed Hero",
    slug: seed.slug ?? nextId("seed-hero"),
    primaryRole: seed.primaryRole ?? "fighter",
    secondaryRole: seed.secondaryRole ?? null,
    specialty: seed.specialty ?? null,
    portraitMediaId: seed.portraitMediaId ?? null,
    masteryLevel: seed.masteryLevel ?? 0,
    totalMatches: seed.totalMatches ?? 0,
    winRate: seed.winRate ?? null,
    isSignature: seed.isSignature ?? false,
    isFavorite: seed.isFavorite ?? false,
    publicationState: seed.publicationState ?? "draft",
    archivedAt: seed.archivedAt ?? null,
    createdAt: seed.createdAt ?? nowIso(),
    updatedAt: seed.updatedAt ?? nowIso(),
  };
}

function seedSkin(seed: Partial<DraftSkin>): DraftSkin {
  return {
    id: seed.id ?? nextId("skin"),
    name: seed.name ?? "Seed Skin",
    slug: seed.slug ?? nextId("seed-skin"),
    heroId: seed.heroId ?? null,
    rarity: seed.rarity ?? "basic",
    series: seed.series ?? null,
    splashArtMediaId: seed.splashArtMediaId ?? null,
    variant: seed.variant ?? null,
    acquisitionDate: seed.acquisitionDate ?? null,
    acquisitionMilestone: seed.acquisitionMilestone ?? null,
    isOwned: seed.isOwned ?? false,
    isFavorite: seed.isFavorite ?? false,
    publicationState: seed.publicationState ?? "draft",
    archivedAt: seed.archivedAt ?? null,
    createdAt: seed.createdAt ?? nowIso(),
    updatedAt: seed.updatedAt ?? nowIso(),
  };
}

function seedTimelineEntry(
  seed: Partial<DraftTimelineEntry>
): DraftTimelineEntry {
  return {
    id: seed.id ?? nextId("timeline"),
    title: seed.title ?? "Seed entry",
    body: seed.body ?? null,
    kind: seed.kind ?? "milestone",
    occurredOn: seed.occurredOn ?? "2026-01-01",
    mediaId: seed.mediaId ?? null,
    isHighlight: seed.isHighlight ?? false,
    publicationState: seed.publicationState ?? "draft",
    archivedAt: seed.archivedAt ?? null,
    createdAt: seed.createdAt ?? nowIso(),
    updatedAt: seed.updatedAt ?? nowIso(),
  };
}

function seedAchievement(seed: Partial<DraftAchievement>): DraftAchievement {
  return {
    id: seed.id ?? nextId("achievement"),
    title: seed.title ?? "Seed achievement",
    description: seed.description ?? null,
    category: seed.category ?? "other",
    earnedOn: seed.earnedOn ?? null,
    iconMediaId: seed.iconMediaId ?? null,
    publicationState: seed.publicationState ?? "draft",
    archivedAt: seed.archivedAt ?? null,
    createdAt: seed.createdAt ?? nowIso(),
    updatedAt: seed.updatedAt ?? nowIso(),
  };
}

function seedAppearanceSettings(
  seed?: Partial<DraftAppearanceSettings>
): DraftAppearanceSettings {
  return {
    id: 1,
    themePreset: seed?.themePreset ?? "adaptive",
    primaryAccent: seed?.primaryAccent ?? "#8b5cf6",
    secondaryAccent: seed?.secondaryAccent ?? "#f59e0b",
    typographyScale: seed?.typographyScale ?? 1.0,
    containerWidthPx: seed?.containerWidthPx ?? 1200,
    spacingScale: seed?.spacingScale ?? 1.0,
    customCss: seed?.customCss ?? null,
    publicationState: seed?.publicationState ?? "draft",
    createdAt: seed?.createdAt ?? nowIso(),
    updatedAt: seed?.updatedAt ?? nowIso(),
  };
}
export interface InMemoryServiceOptions {
  actor?: InMemoryActor;
  seed?: SeedData;
}

/**
 * Creates a fresh in-memory service. Each call gets its own data, so tests are
 * isolated by construction.
 */
export function createInMemoryContentService(
  options: InMemoryServiceOptions = {}
): ContentService {
  const actor = options.actor ?? UNAUTHENTICATED_ACTOR;
  const heroes = (options.seed?.heroes ?? []).map(seedHero);
  const skins = (options.seed?.skins ?? []).map(seedSkin);
  const achievements = (options.seed?.achievements ?? []).map(seedAchievement);
  const timelineEntries = (options.seed?.timelineEntries ?? []).map(
    seedTimelineEntry
  );
  const releaseSnapshots = (options.seed?.releaseSnapshots ?? []).map(
    (seed: Partial<ReleaseSnapshot>) => seed
  );
  let appearanceSettings = seedAppearanceSettings(
    options.seed as Partial<SeedData> & {
      appearanceSettings?: Partial<DraftAppearanceSettings>;
    }["appearanceSettings"]
      ? (options.seed as any).appearanceSettings
      : undefined
  );
  let draftHomepageSections: any[] = (options.seed?.homepageSections ?? defaultHomepageSectionConfiguration()).map(
    (seed: any) => ({
      sectionId: seed.sectionId,
      position: seed.position,
      isEnabled: seed.isEnabled ?? true,
      publicationState: (seed.publicationState as any) ?? "draft",
      createdAt: seed.createdAt ?? nowIso(),
      updatedAt: seed.updatedAt ?? nowIso(),
    })
  );
  const publishedRelease = options.seed?.publishedRelease ?? null;

  function requireAdmin(): void {
    if (!actor.configured) {
      throw new ContentServiceError("NOT_CONFIGURED");
    }
    if (!actor.authenticated) {
      throw new ContentServiceError("UNAUTHENTICATED");
    }
    if (!actor.admin) {
      throw new ContentServiceError("UNAUTHORIZED");
    }
  }

  function requirePublicConfigured(): void {
    if (!actor.configured) {
      throw new ContentServiceError("NOT_CONFIGURED");
    }
  }

  function applyListFilter<T extends { publicationState: DraftState }>(
    rows: T[],
    listOptions: DraftListOptions
  ): T[] {
    if (listOptions.state) {
      return rows.filter((row) => row.publicationState === listOptions.state);
    }
    return listOptions.includeArchived
      ? rows
      : rows.filter((row) => row.publicationState !== "archived");
  }

  function findIndex<T extends { id: string }>(rows: T[], id: string): number {
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) {
      throw new ContentServiceError("NOT_FOUND", {
        message: `No record exists with id "${id}".`,
      });
    }
    return index;
  }

  /** Enforces unique slugs the way the schema's unique index does. */
  function assertUniqueSlug(
    rows: Array<{ id: string; slug: string }>,
    slug: string,
    selfId?: string
  ): void {
    const clash = rows.some((row) => row.slug === slug && row.id !== selfId);
    if (clash) {
      throw new ContentServiceError("CONFLICT", {
        message: `Slug "${slug}" is already in use.`,
      });
    }
  }

  function assertHeroExists(heroId: string | null): void {
    if (heroId && !heroes.some((hero) => hero.id === heroId)) {
      throw new ContentServiceError("DEPENDENCY_MISSING", {
        message: `No hero exists with id "${heroId}".`,
      });
    }
  }

  /** Turns validator issues into the port's typed error (mirrors `service.ts`). */
  function requireValidation<T>(result: ValidationResult<T>): T {
    if (!result.ok) {
      throw new ContentServiceError("VALIDATION_FAILED", {
        issues: result.issues,
      });
    }
    return result.value;
  }

  return {
    async listDraftHeroes(listOptions = {}) {
      requireAdmin();
      return applyListFilter(heroes, listOptions).map((row) => ({ ...row }));
    },

    async getDraftHero(id) {
      requireAdmin();
      return { ...heroes[findIndex(heroes, id)] };
    },

    async listDraftSkins(listOptions = {}) {
      requireAdmin();
      const scoped = listOptions.heroId
        ? skins.filter((skin) => skin.heroId === listOptions.heroId)
        : skins;
      return applyListFilter(scoped, listOptions).map((row) => ({ ...row }));
    },

    async getDraftSkin(id) {
      requireAdmin();
      return { ...skins[findIndex(skins, id)] };
    },

    async listDraftAchievements(listOptions = {}) {
      requireAdmin();
      return applyListFilter(achievements, listOptions).map((row) => ({
        ...row,
      }));
    },

    async listDraftTimelineEntries(listOptions = {}) {
      requireAdmin();
      return applyListFilter(timelineEntries, listOptions).map((row) => ({
        ...row,
      }));
    },

    async createDraftHero(input: HeroInput) {
      requireAdmin();
      const validated = validateHeroInput(input);
      if (!validated.ok) {
        throw new ContentServiceError("VALIDATION_FAILED", {
          issues: validated.issues,
        });
      }
      assertUniqueSlug(heroes, validated.value.slug);
      const hero: DraftHero = {
        id: nextId("hero"),
        ...validated.value,
        publicationState: "draft",
        archivedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      heroes.push(hero);
      return { ...hero };
    },

    async updateDraftHero(id, input: Partial<HeroInput>) {
      requireAdmin();
      const validated = validateHeroInput(input);
      if (!validated.ok) {
        throw new ContentServiceError("VALIDATION_FAILED", {
          issues: validated.issues,
        });
      }
      const index = findIndex(heroes, id);
      assertUniqueSlug(heroes, validated.value.slug, id);
      const updated: DraftHero = {
        ...heroes[index],
        ...validated.value,
        updatedAt: nowIso(),
      };
      heroes[index] = updated;
      return { ...updated };
    },

    async deleteDraftHero(id) {
      requireAdmin();
      heroes.splice(findIndex(heroes, id), 1);
    },

    async createDraftSkin(input: SkinInput) {
      requireAdmin();
      const validated = validateSkinInput(input);
      if (!validated.ok) {
        throw new ContentServiceError("VALIDATION_FAILED", {
          issues: validated.issues,
        });
      }
      assertUniqueSlug(skins, validated.value.slug);
      assertHeroExists(validated.value.heroId);
      const skin: DraftSkin = {
        id: nextId("skin"),
        ...validated.value,
        publicationState: "draft",
        archivedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      skins.push(skin);
      return { ...skin };
    },

    async updateDraftSkin(id, input: Partial<SkinInput>) {
      requireAdmin();
      const validated = validateSkinInput(input);
      if (!validated.ok) {
        throw new ContentServiceError("VALIDATION_FAILED", {
          issues: validated.issues,
        });
      }
      const index = findIndex(skins, id);
      assertUniqueSlug(skins, validated.value.slug, id);
      assertHeroExists(validated.value.heroId);
      const updated: DraftSkin = {
        ...skins[index],
        ...validated.value,
        updatedAt: nowIso(),
      };
      skins[index] = updated;
      return { ...updated };
    },

    async deleteDraftSkin(id) {
      requireAdmin();
      skins.splice(findIndex(skins, id), 1);
    },

    async createDraftTimelineEntry(input: TimelineEntryInput) {
      requireAdmin();
      const validated = validateTimelineEntryInput(input);
      if (!validated.ok) {
        throw new ContentServiceError("VALIDATION_FAILED", {
          issues: validated.issues,
        });
      }
      const entry: DraftTimelineEntry = {
        id: nextId("timeline"),
        ...validated.value,
        publicationState: "draft",
        archivedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      timelineEntries.push(entry);
      return { ...entry };
    },

    async updateDraftTimelineEntry(id, input: Partial<TimelineEntryInput>) {
      requireAdmin();
      const validated = validateTimelineEntryInput(input);
      if (!validated.ok) {
        throw new ContentServiceError("VALIDATION_FAILED", {
          issues: validated.issues,
        });
      }
      const index = findIndex(timelineEntries, id);
      const updated: DraftTimelineEntry = {
        ...timelineEntries[index],
        ...validated.value,
        updatedAt: nowIso(),
      };
      timelineEntries[index] = updated;
      return { ...updated };
    },

    async deleteDraftTimelineEntry(id) {
      requireAdmin();
      timelineEntries.splice(findIndex(timelineEntries, id), 1);
    },

    async getDraftAppearanceSettings() {
      requireAdmin();
      return JSON.parse(JSON.stringify(appearanceSettings));
    },

    async updateDraftAppearanceSettings(input) {
      requireAdmin();
      const validated = requireValidation(
        validateAppearanceSettingsInput(input)
      );
      appearanceSettings = {
        ...appearanceSettings,
        ...validated,
        updatedAt: nowIso(),
      };
      return JSON.parse(JSON.stringify(appearanceSettings));
    },

    async listDraftHomepageSections() {
      requireAdmin();
      return draftHomepageSections.map((row: any) => ({ ...row }));
    },

    async updateDraftHomepageSections(input: any) {
      requireAdmin();
      const validated = requireValidation(validateHomepageSectionOrder(input));
      draftHomepageSections = (validated as any[]).map((entry: any) => ({
        sectionId: entry.sectionId,
        position: entry.position,
        isEnabled: entry.isEnabled,
        publicationState: "draft",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }));
      return draftHomepageSections.map((row: any) => ({ ...row }));
    },

    async transitionDraftState(
      resource: DraftResource,
      id: string,
      transition
    ) {
      requireAdmin();
      const rows: Array<{
        id: string;
        publicationState: DraftState;
        archivedAt: string | null;
        updatedAt: string;
      }> =
        resource === "heroes"
          ? heroes
          : resource === "skins"
            ? skins
            : resource === "achievements"
              ? achievements
              : timelineEntries;
      const index = findIndex(rows, id);
      const current = rows[index];
      const next = resolveDraftTransition(current.publicationState, transition);
      if (next === null) {
        throw new ContentServiceError("INVALID_TRANSITION", {
          message: `Cannot ${transition} a ${current.publicationState} record.`,
        });
      }
      current.publicationState = next;
      current.archivedAt = next === "archived" ? nowIso() : null;
      current.updatedAt = nowIso();
    },

    async getActiveRelease(): Promise<ActiveRelease | null> {
      requirePublicConfigured();
      return publishedRelease ? { ...publishedRelease.release } : null;
    },

    async getPublishedRelease(): Promise<PublishedRelease> {
      requirePublicConfigured();
      if (!publishedRelease) {
        throw new ContentServiceError("NO_PUBLISHED_RELEASE");
      }
      return {
        release: { ...publishedRelease.release },
        heroes: publishedRelease.heroes.map((row) => ({ ...row })),
        skins: publishedRelease.skins.map((row) => ({ ...row })),
        achievements: publishedRelease.achievements.map((row) => ({ ...row })),
        timelineEntries: publishedRelease.timelineEntries.map((row) => ({
          ...row,
        })),
      };
    },

    async getPublishedHomepageSections() {
      requirePublicConfigured();
      const sections = (publishedRelease as any)?.homepageSections ?? [];
      return sections
        .filter(
          (entry: any) =>
            entry &&
            entry.isEnabled &&
            typeof entry.sectionId === "string"
        )
        .map((entry: any) => ({ ...entry }));
    },

    async getReleaseSnapshot(releaseId: string): Promise<ReleaseSnapshot> {
      requireAdmin();
      const snapshots = releaseSnapshots;
      const snap = snapshots.find(
        (s: any) => (s.releaseId ?? s.release_id) === releaseId
      );
      if (!snap) {
        throw new ContentServiceError("NO_PUBLISHED_RELEASE", {
          message: `No release snapshot found for release "${releaseId}".`,
        });
      }
      return {
        id: String(snap.id),
        releaseId: String((snap as any).releaseId ?? (snap as any).release_id),
        version: Number(snap.version),
        label: snap.label ?? null,
        payload: snap.payload,
        payloadFormatVersion: Number(
          (snap as any).payloadFormatVersion ?? (snap as any).payload_format_version ?? 1
        ),
        checksumSha256: String(
          (snap as any).checksumSha256 ?? (snap as any).checksum_sha256
        ),
        createdAt: String(
          (snap as any).createdAt ?? (snap as any).created_at ?? nowIso()
        ),
      };
    },

    async computeReleaseDiff(releaseId: string): Promise<ReleaseDiff> {
      requireAdmin();

      const snapshot = await this.getReleaseSnapshot(releaseId);

      // Use closure seed data for draft rows
      const draftHeroes: Array<Record<string, unknown>> = heroes.map((h) => ({
        ...h,
      }));
      const draftSkins: Array<Record<string, unknown>> = skins.map((s) => ({
        ...s,
      }));
      const draftAchievements: Array<Record<string, unknown>> = achievements.map(
        (a) => ({ ...a })
      );
      const draftTimelineEntries: Array<Record<string, unknown>> =
        timelineEntries.map((t) => ({ ...t }));

      const draftAppearanceSettings = appearanceSettings;

      // Diff: compare snapshot heroes vs draft heroes by ID
      const snapshotHeroes = (snapshot.payload as any)?.heroes ?? [];
      const diffs: DiffEntry[] = [];

      const draftHeroIds = new Set(draftHeroes.map((h) => String(h.id)));
      const snapshotHeroIds = new Set(snapshotHeroes.map((s: any) => s.id));

      // Heroes in snapshot but not in draft
      for (const id of snapshotHeroIds as Set<string>) {
        if (!draftHeroIds.has(id)) {
          diffs.push({
            path: "heroes",
            kind: "removed",
            old: snapshotHeroes.find((s: any) => s.id === id),
          });
        }
      }

      // Heroes in draft: added or changed/unchanged
      for (const hero of draftHeroes) {
        const id = String(hero.id);
        const snapshotHero = snapshotHeroes.find((s: any) => s.id === id);
        if (!snapshotHero) {
          diffs.push({ path: "heroes", kind: "added", new: hero });
          continue;
        }
        if (JSON.stringify(hero) !== JSON.stringify(snapshotHero)) {
          diffs.push({
            path: "heroes",
            kind: "changed",
            old: snapshotHero,
            new: hero,
          });
        } else {
          diffs.push({ path: "heroes", kind: "unchanged" });
        }
      }

      // Skins diff
      const snapshotSkins = (snapshot.payload as any)?.skins ?? [];
      const skinDiffs: DiffEntry[] = [];
      const draftSkinIds = new Set(draftSkins.map((s) => String(s.id)));
      const snapshotSkinIds = new Set(snapshotSkins.map((s: any) => s.id));
      for (const id of snapshotSkinIds as Set<string>) {
        if (!draftSkinIds.has(id)) {
          skinDiffs.push({
            path: "skins",
            kind: "removed",
            old: snapshotSkins.find((s: any) => s.id === id),
          });
        }
      }
      for (const skin of draftSkins) {
        const id = String(skin.id);
        const snapshotSkin = snapshotSkins.find((s: any) => s.id === id);
        if (!snapshotSkin) {
          skinDiffs.push({ path: "skins", kind: "added", new: skin });
          continue;
        }
        if (JSON.stringify(skin) !== JSON.stringify(snapshotSkin)) {
          skinDiffs.push({
            path: "skins",
            kind: "changed",
            old: snapshotSkin,
            new: skin,
          });
        } else {
          skinDiffs.push({ path: "skins", kind: "unchanged" });
        }
      }

      // Achievements diff
      const snapshotAchievements = (snapshot.payload as any)?.achievements ?? [];
      const achievementDiffs: DiffEntry[] = [];
      const draftAchIds = new Set(draftAchievements.map((a) => String(a.id)));
      const snapshotAchIds = new Set(snapshotAchievements.map((a: any) => a.id));
      for (const id of snapshotAchIds as Set<string>) {
        if (!draftAchIds.has(id)) {
          achievementDiffs.push({
            path: "achievements",
            kind: "removed",
            old: snapshotAchievements.find((a: any) => a.id === id),
          });
        }
      }
      for (const ach of draftAchievements) {
        const id = String(ach.id);
        const snapshotAch = snapshotAchievements.find((a: any) => a.id === id);
        if (!snapshotAch) {
          achievementDiffs.push({
            path: "achievements",
            kind: "added",
            new: ach,
          });
          continue;
        }
        if (JSON.stringify(ach) !== JSON.stringify(snapshotAch)) {
          achievementDiffs.push({
            path: "achievements",
            kind: "changed",
            old: snapshotAch,
            new: ach,
          });
        } else {
          achievementDiffs.push({ path: "achievements", kind: "unchanged" });
        }
      }

      // Timeline diff
      const snapshotTimeline = (snapshot.payload as any)?.timeline_entries ?? [];
      const timelineDiffs: DiffEntry[] = [];
      const draftTimIds = new Set(draftTimelineEntries.map((t) => String(t.id)));
      const snapshotTimIds = new Set(snapshotTimeline.map((t: any) => t.id));
      for (const id of snapshotTimIds as Set<string>) {
        if (!draftTimIds.has(id)) {
          timelineDiffs.push({
            path: "timeline_entries",
            kind: "removed",
            old: snapshotTimeline.find((t: any) => t.id === id),
          });
        }
      }
      for (const tim of draftTimelineEntries) {
        const id = String(tim.id);
        const snapshotTim = snapshotTimeline.find((t: any) => t.id === id);
        if (!snapshotTim) {
          timelineDiffs.push({
            path: "timeline_entries",
            kind: "added",
            new: tim,
          });
          continue;
        }
        if (JSON.stringify(tim) !== JSON.stringify(snapshotTim)) {
          timelineDiffs.push({
            path: "timeline_entries",
            kind: "changed",
            old: snapshotTim,
            new: tim,
          });
        } else {
          timelineDiffs.push({ path: "timeline_entries", kind: "unchanged" });
        }
      }

      // Appearance diff
      const snapshotAppearance = (snapshot.payload as any)?.appearance_settings ?? null;
      const appearanceDiffs: DiffEntry[] = [];
      if (!draftAppearanceSettings && !snapshotAppearance) {
        appearanceDiffs.push({ path: "appearance_settings", kind: "unchanged" });
      } else if (!draftAppearanceSettings) {
        appearanceDiffs.push({
          path: "appearance_settings",
          kind: "added",
          new: snapshotAppearance,
        });
      } else if (!snapshotAppearance) {
        appearanceDiffs.push({
          path: "appearance_settings",
          kind: "removed",
          old: draftAppearanceSettings,
        });
      } else if (
        JSON.stringify(draftAppearanceSettings) !== JSON.stringify(snapshotAppearance)
      ) {
        appearanceDiffs.push({
          path: "appearance_settings",
          kind: "changed",
          old: snapshotAppearance,
          new: draftAppearanceSettings,
        });
      } else {
        appearanceDiffs.push({ path: "appearance_settings", kind: "unchanged" });
      }

      return {
        releaseId,
        snapshot,
        drafts: {
          heroes: diffs,
          skins: skinDiffs,
          achievements: achievementDiffs,
          timelineEntries: timelineDiffs,
          appearanceSettings: appearanceDiffs,
        },
      } as ReleaseDiff;
    },
  };
}
