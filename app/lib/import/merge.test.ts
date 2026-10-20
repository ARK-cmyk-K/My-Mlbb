import assert from "node:assert/strict";
import { test } from "node:test";

import type { DraftHero, DraftSkin } from "../content/contracts.ts";
import {
  buildMergePreview,
  buildMergePlan,
  defaultResolutions,
  detectStaleness,
  validateMergeResolutions,
  type MergePreviewPayload,
  type MergeReferences,
  type MergeRowResolution,
  type MergeValue,
} from "./merge.ts";

const HERO_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const MEDIA_ID = "9b2f6a10-2c34-4b56-8d78-0a1b2c3d4e5f";
const NOW = "2026-01-01T00:00:00.000Z";

const HERO_COLUMNS = [
  "name",
  "slug",
  "primary_role",
  "secondary_role",
  "specialty",
  "portrait_media_id",
  "mastery_level",
  "total_matches",
  "win_rate",
  "is_signature",
  "is_favorite",
] as const;
type HeroColumn = (typeof HERO_COLUMNS)[number];

const SKIN_COLUMNS = [
  "name",
  "slug",
  "hero_slug",
  "rarity",
  "series",
  "splash_art_media_id",
  "variant",
  "acquisition_date",
  "acquisition_milestone",
  "is_owned",
  "is_favorite",
] as const;
type SkinColumn = (typeof SKIN_COLUMNS)[number];

function heroRow(overrides: Partial<Record<HeroColumn, string>> = {}): string[] {
  const base: Record<HeroColumn, string> = {
    name: "Layla",
    slug: "layla",
    primary_role: "marksman",
    secondary_role: "",
    specialty: "Marksman",
    portrait_media_id: "",
    mastery_level: "10",
    total_matches: "120",
    win_rate: "55.5",
    is_signature: "false",
    is_favorite: "yes",
  };
  return HERO_COLUMNS.map((column) => overrides[column] ?? base[column]);
}

function skinRow(overrides: Partial<Record<SkinColumn, string>> = {}): string[] {
  const base: Record<SkinColumn, string> = {
    name: "Crimson Vanguard",
    slug: "crimson-vanguard",
    hero_slug: "layla",
    rarity: "epic",
    series: "Starlight Carnival",
    splash_art_media_id: MEDIA_ID,
    variant: "painted",
    acquisition_date: "2025-06-01",
    acquisition_milestone: "Anniversary recharge",
    is_owned: "yes",
    is_favorite: "no",
  };
  return SKIN_COLUMNS.map((column) => overrides[column] ?? base[column]);
}

function csv(header: readonly string[], rows: readonly (readonly string[])[]): string[][] {
  return [[...header], ...rows.map((row) => [...row])];
}

function makeHero(overrides: Partial<DraftHero> = {}): DraftHero {
  return {
    id: HERO_ID,
    name: "Layla",
    slug: "layla",
    primaryRole: "marksman",
    secondaryRole: null,
    specialty: "Marksman",
    portraitMediaId: null,
    masteryLevel: 10,
    totalMatches: 120,
    winRate: 55.5,
    isSignature: false,
    isFavorite: true,
    publicationState: "draft",
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeSkin(overrides: Partial<DraftSkin> = {}): DraftSkin {
  return {
    id: "skin-1",
    name: "Crimson Vanguard",
    slug: "crimson-vanguard",
    heroId: HERO_ID,
    rarity: "epic",
    series: "Starlight Carnival",
    splashArtMediaId: MEDIA_ID,
    variant: "painted",
    acquisitionDate: "2025-06-01",
    acquisitionMilestone: "Anniversary recharge",
    isOwned: true,
    isFavorite: false,
    publicationState: "draft",
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function emptyRefs(): MergeReferences {
  return { existingSlugs: [], heroes: [], skins: [] };
}

function mapResolutions(resolutions: MergeRowResolution[]) {
  return new Map(resolutions.map((r) => [r.row, r]));
}

test("builds merge preview with diffs for existing hero", () => {
  const hero = makeHero({ winRate: 50 });
  const refs: MergeReferences = {
    existingSlugs: ["layla"],
    heroes: [hero],
    skins: [],
  };
  const result = buildMergePreview("heroes", csv(HERO_COLUMNS, [heroRow({ win_rate: "55.5" })]), refs);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const existing = result.payload.rows.find((r) => r.action === "existing");
  assert.ok(existing);
  const winRate = existing.diffs.find((d) => d.field === "winRate");
  assert.ok(winRate);
  assert.equal(winRate.differs, true);
  assert.equal(winRate.existing, 50);
  assert.equal(winRate.imported, 55.5);
  assert.equal(existing.snapshot?.id, HERO_ID);
  assert.equal(existing.snapshot?.updatedAt, NOW);
});

test("detects staleness when existing row updated between preview and commit", () => {
  const hero = makeHero();
  const refs: MergeReferences = { existingSlugs: ["layla"], heroes: [hero], skins: [] };
  const preview = buildMergePreview("heroes", csv(HERO_COLUMNS, [heroRow()]), refs);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const freshHero = makeHero({ winRate: 60, updatedAt: "2026-01-01T00:00:01.000Z" });
  const fresh = buildMergePreview("heroes", csv(HERO_COLUMNS, [heroRow()]), {
    existingSlugs: ["layla"],
    heroes: [freshHero],
    skins: [],
  });
  assert.equal(fresh.ok, true);
  if (!fresh.ok) return;
  const staleness = detectStaleness(preview.payload.rows, fresh.payload.rows);
  assert.equal(staleness.length > 0, true);
});

test("validates resolutions: missing field choice is rejected", () => {
  const hero = makeHero({ winRate: 50 });
  const refs: MergeReferences = { existingSlugs: ["layla"], heroes: [hero], skins: [] };
  const preview = buildMergePreview("heroes", csv(HERO_COLUMNS, [heroRow({ win_rate: "55.5" })]), refs);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const check = validateMergeResolutions(preview.payload, [
    { row: 2, action: "include", fields: {} },
  ]);
  assert.equal(check.ok, false);
});

test("buildMergePlan produces update when choosing use", () => {
  const hero = makeHero({ winRate: 50 });
  const refs: MergeReferences = { existingSlugs: ["layla"], heroes: [hero], skins: [] };
  const preview = buildMergePreview("heroes", csv(HERO_COLUMNS, [heroRow({ win_rate: "55.5" })]), refs);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const resolutions = validateMergeResolutions(preview.payload, [
    { row: 2, action: "include", fields: { winRate: "use" } },
  ]);
  assert.equal(resolutions.ok, true);
  if (!resolutions.ok) return;
  const plan = buildMergePlan(preview.payload, resolutions.value);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.plan.ops.length, 1);
  assert.equal(plan.plan.ops[0]?.kind, "update");
});

test("buildMergePlan produces unchanged when keep all", () => {
  const hero = makeHero({ winRate: 55.5 });
  const refs: MergeReferences = { existingSlugs: ["layla"], heroes: [hero], skins: [] };
  const preview = buildMergePreview("heroes", csv(HERO_COLUMNS, [heroRow({ win_rate: "55.5" })]), refs);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const resolutions = validateMergeResolutions(preview.payload, defaultResolutions(preview.payload));
  assert.equal(resolutions.ok, true);
  if (!resolutions.ok) return;
  const plan = buildMergePlan(preview.payload, resolutions.value);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.plan.ops.length, 0);
  assert.equal(plan.plan.unchanged.length, 1);
});

test("skipped row produces no op", () => {
  const refs = emptyRefs();
  const preview = buildMergePreview("heroes", csv(HERO_COLUMNS, [heroRow()]), refs);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const resolutions = [
    { row: 2, action: "skip", fields: {} },
  ];
  const check = validateMergeResolutions(preview.payload, resolutions);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  const plan = buildMergePlan(preview.payload, check.value);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.plan.ops.length, 0);
  assert.equal(plan.plan.skipped.length, 1);
});
