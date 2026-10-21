import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublishedHero, PublishedSkin } from "../content/contracts.ts";
import {
  COMPARISON_FIELDS,
  COMPARISON_TABS,
  buildComparisonModel,
  buildPerformanceRows,
  buildQuickViewModel,
  buildSkinRows,
  countOwnedSkins,
  countSkinsForHero,
  formatWinRate,
  masteryGrade,
  resolveComparisonEntries,
  resolveEntry,
  type EntryDetails,
  type PublishedCollection,
} from "./compare-model.ts";

/**
 * Quick view / comparison model tests (task 05-05).
 *
 * The contract under test:
 *
 * - only published data is read, and a reference to something the release does
 *   not contain resolves to nothing;
 * - a value that was never recorded is reported as `not-recorded`, and an
 *   attribute the entity type does not have is reported as `not-applicable` —
 *   neither is ever replaced by an invented number;
 * - the two comparison tabs expose exactly the fields the task requires, in a
 *   fixed order, and both columns stay aligned;
 * - derived values (the mastery grade, the owned-skin count) are derived from
 *   recorded data and never from a guess.
 */

let heroSeq = 0;
function hero(overrides: Partial<PublishedHero> = {}): PublishedHero {
  heroSeq += 1;
  return {
    id: `hero-${heroSeq}`,
    releaseId: "release-1",
    name: `Hero ${heroSeq}`,
    slug: `hero-${heroSeq}`,
    primaryRole: "mage",
    secondaryRole: null,
    specialty: null,
    portraitMediaId: null,
    masteryLevel: 50,
    totalMatches: 100,
    winRate: null,
    isSignature: false,
    isFavorite: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let skinSeq = 0;
function skin(overrides: Partial<PublishedSkin> = {}): PublishedSkin {
  skinSeq += 1;
  return {
    id: `skin-${skinSeq}`,
    releaseId: "release-1",
    heroId: null,
    name: `Skin ${skinSeq}`,
    slug: `skin-${skinSeq}`,
    rarity: "basic",
    series: null,
    splashArtMediaId: null,
    variant: null,
    acquisitionDate: null,
    acquisitionMilestone: null,
    isOwned: false,
    isFavorite: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function collection(heroes: PublishedHero[], skins: PublishedSkin[]): PublishedCollection {
  return { heroes, skins };
}

function rowFor(rows: readonly { key: string }[], key: string) {
  const row = rows.find((entry) => entry.key === key);
  assert.ok(row, `expected a row with key "${key}"`);
  return row as ReturnType<typeof buildSkinRows>[number];
}

// ---------------------------------------------------------------------------
// Entry resolution
// ---------------------------------------------------------------------------

test("a reference resolves to the published entry it points at", () => {
  const ally = hero({ name: "Yi Sun-shin", primaryRole: "tank" });
  const epic = skin({ name: "Legend Skin", rarity: "legend", heroId: ally.id });
  const published = collection([ally], [epic]);

  const resolvedHero = resolveEntry(published, { kind: "hero", id: ally.id });
  assert.ok(resolvedHero);
  assert.equal(resolvedHero.kind, "hero");
  assert.equal(resolvedHero.name, "Yi Sun-shin");
  assert.equal(resolvedHero.context, "Tank");
  assert.equal(resolvedHero.mediaAlt, "Portrait of Yi Sun-shin");
  assert.equal(resolvedHero.hero?.id, ally.id);

  const resolvedSkin = resolveEntry(published, { kind: "skin", id: epic.id });
  assert.ok(resolvedSkin);
  assert.equal(resolvedSkin.kind, "skin");
  assert.equal(resolvedSkin.context, "Yi Sun-shin");
  assert.equal(resolvedSkin.mediaAlt, "Legend Skin splash art");
  assert.equal(resolvedSkin.hero?.id, ally.id);
});

test("an unknown reference resolves to nothing instead of a half-populated entry", () => {
  const published = collection([hero()], [skin()]);
  assert.equal(resolveEntry(published, { kind: "hero", id: "missing" }), null);
  assert.equal(resolveEntry(published, { kind: "skin", id: "missing" }), null);
  assert.equal(resolveEntry(null, { kind: "hero", id: "missing" }), null);
  assert.deepEqual(
    resolveComparisonEntries(published, [
      { kind: "hero", id: "missing" },
      { kind: "skin", id: "missing" },
    ]),
    []
  );
});

test("a skin without a linked hero keeps no hero context", () => {
  const orphan = skin({ name: "Orphan Skin" });
  const resolved = resolveEntry(collection([], [orphan]), {
    kind: "skin",
    id: orphan.id,
  });
  assert.ok(resolved);
  assert.equal(resolved.context, null);
  assert.equal(resolved.hero, null);
});

// ---------------------------------------------------------------------------
// Mastery grading and win-rate formatting
// ---------------------------------------------------------------------------

test("mastery grades cover the whole 0-100 range", () => {
  assert.deepEqual(masteryGrade(0), { label: "Not mastered", level: 0 });
  assert.deepEqual(masteryGrade(19), { label: "Novice", level: 19 });
  assert.deepEqual(masteryGrade(20), { label: "Apprentice", level: 20 });
  assert.deepEqual(masteryGrade(40), { label: "Skilled", level: 40 });
  assert.deepEqual(masteryGrade(60), { label: "Advanced", level: 60 });
  assert.deepEqual(masteryGrade(80), { label: "Expert", level: 80 });
  assert.deepEqual(masteryGrade(100), { label: "Master", level: 100 });
});

test("an out-of-range mastery score is not graded", () => {
  assert.equal(masteryGrade(-1), null);
  assert.equal(masteryGrade(101), null);
  assert.equal(masteryGrade(Number.NaN), null);
  assert.equal(masteryGrade(null), null);
  assert.equal(masteryGrade(undefined), null);
});

test("a win rate is only formatted when it was recorded", () => {
  assert.equal(formatWinRate(58.34), "58.3%");
  assert.equal(formatWinRate(0), "0.0%");
  assert.equal(formatWinRate(100), "100.0%");
  assert.equal(formatWinRate(null), null);
  assert.equal(formatWinRate(undefined), null);
  assert.equal(formatWinRate(Number.NaN), null);
});

// ---------------------------------------------------------------------------
// Skin view rows
// ---------------------------------------------------------------------------

test("the skin view covers splash art, rarity, series, variant and acquisition", () => {
  const ally = hero({ name: "Yi Sun-shin" });
  const epic = skin({
    heroId: ally.id,
    rarity: "collector",
    series: "Abyss",
    variant: "painted",
    acquisitionDate: "2024-03-04",
    acquisitionMilestone: "Anniversary",
    splashArtMediaId: "media-1",
  });
  const published = collection([ally], [epic]);
  const entry = resolveEntry(published, { kind: "skin", id: epic.id }) as EntryDetails;
  const rows = buildSkinRows(published, entry);

  assert.deepEqual(
    rows.map((row) => row.key),
    ["rarity", "series", "variant", "acquisition"]
  );
  assert.equal(rowFor(rows, "rarity").value, "Collector");
  assert.equal(rowFor(rows, "series").value, "Abyss");
  assert.equal(rowFor(rows, "variant").value, "Painted");
  assert.equal(rowFor(rows, "acquisition").value, "Mar 4, 2024");
  assert.equal(rowFor(rows, "acquisition").dateTime, "2024-03-04");
  assert.equal(
    rowFor(rows, "acquisition").note,
    "Milestone: Anniversary",
    "the milestone is kept next to the recorded date"
  );
  assert.equal(entry.mediaId, "media-1");
});

test("missing skin attributes are reported as not recorded, never invented", () => {
  const bare = skin({ series: null, variant: null, acquisitionDate: null });
  const published = collection([], [bare]);
  const entry = resolveEntry(published, { kind: "skin", id: bare.id }) as EntryDetails;
  const rows = buildSkinRows(published, entry);

  for (const key of ["series", "variant", "acquisition"]) {
    const row = rowFor(rows, key);
    assert.equal(row.status, "not-recorded");
    assert.equal(row.value, null, `${key} must not carry a made-up value`);
  }
  assert.equal(rowFor(rows, "rarity").status, "recorded");
});

test("a milestone is used when no acquisition date was recorded", () => {
  const milestoneOnly = skin({
    acquisitionDate: null,
    acquisitionMilestone: "First anniversary",
  });
  const published = collection([], [milestoneOnly]);
  const entry = resolveEntry(published, {
    kind: "skin",
    id: milestoneOnly.id,
  }) as EntryDetails;
  const row = rowFor(buildSkinRows(published, entry), "acquisition");

  assert.equal(row.status, "recorded");
  assert.equal(row.value, "First anniversary");
  assert.equal(row.dateTime, null);
});

test("a hero has no skin attributes, which is not the same as a missing one", () => {
  const ally = hero();
  const published = collection([ally], []);
  const entry = resolveEntry(published, { kind: "hero", id: ally.id }) as EntryDetails;
  const rows = buildSkinRows(published, entry);

  for (const row of rows) {
    assert.equal(row.status, "not-applicable");
    assert.equal(row.value, null);
  }
});

// ---------------------------------------------------------------------------
// Hero performance rows
// ---------------------------------------------------------------------------

test("the hero performance view covers mastery, matches, win rate, role and skins owned", () => {
  const ally = hero({
    name: "Yi Sun-shin",
    primaryRole: "tank",
    secondaryRole: "support",
    masteryLevel: 82,
    totalMatches: 1240,
    winRate: 58.34,
  });
  const owned = skin({ heroId: ally.id, isOwned: true, rarity: "legend" });
  const unowned = skin({ heroId: ally.id, isOwned: false, rarity: "basic" });
  const published = collection([ally], [owned, unowned]);
  const entry = resolveEntry(published, { kind: "hero", id: ally.id }) as EntryDetails;
  const rows = buildPerformanceRows(published, entry);

  assert.deepEqual(
    rows.map((row) => row.key),
    ["mastery", "matches", "win-rate", "primary-role", "skins-owned"]
  );
  assert.equal(rowFor(rows, "mastery").value, "Expert");
  assert.equal(rowFor(rows, "mastery").numeric, 82);
  assert.equal(rowFor(rows, "mastery").note, "82 / 100");
  assert.equal(rowFor(rows, "matches").value, "1,240");
  assert.equal(rowFor(rows, "matches").numeric, 1240);
  assert.equal(rowFor(rows, "win-rate").value, "58.3%");
  assert.equal(rowFor(rows, "primary-role").value, "Tank");
  assert.equal(rowFor(rows, "primary-role").note, "Secondary: Support");
  assert.equal(rowFor(rows, "skins-owned").value, "1");
  assert.equal(rowFor(rows, "skins-owned").numeric, 1);
  assert.equal(rowFor(rows, "skins-owned").note, "of 2 published");
});

test("an unrecorded win rate stays unrecorded", () => {
  const ally = hero({ winRate: null });
  const published = collection([ally], []);
  const entry = resolveEntry(published, { kind: "hero", id: ally.id }) as EntryDetails;
  const row = rowFor(buildPerformanceRows(published, entry), "win-rate");

  assert.equal(row.status, "not-recorded");
  assert.equal(row.value, null);
});

test("a skin is graded through the hero it belongs to", () => {
  const ally = hero({ masteryLevel: 65, totalMatches: 10, winRate: 60 });
  const epic = skin({ heroId: ally.id });
  const published = collection([ally], [epic]);
  const entry = resolveEntry(published, { kind: "skin", id: epic.id }) as EntryDetails;
  const rows = buildPerformanceRows(published, entry);

  assert.equal(rowFor(rows, "mastery").value, "Advanced");
  assert.equal(rowFor(rows, "matches").value, "10");
  assert.equal(rowFor(rows, "win-rate").value, "60.0%");
  assert.equal(rowFor(rows, "primary-role").value, "Mage");
  assert.equal(rowFor(rows, "skins-owned").value, "0");
});

test("a skin with no hero reports no performance data at all", () => {
  const orphan = skin();
  const published = collection([], [orphan]);
  const entry = resolveEntry(published, { kind: "skin", id: orphan.id }) as EntryDetails;
  const rows = buildPerformanceRows(published, entry);

  for (const row of rows) {
    assert.equal(row.status, "not-recorded");
    assert.equal(row.value, null);
    assert.match(String(row.note), /not linked to a hero/);
  }
});

test("skins owned are counted per hero and only when they are owned", () => {
  const ally = hero();
  const other = hero();
  const published = collection(
    [ally, other],
    [
      skin({ heroId: ally.id, isOwned: true }),
      skin({ heroId: ally.id, isOwned: false }),
      skin({ heroId: other.id, isOwned: true }),
      skin({ heroId: null, isOwned: true }),
    ]
  );

  assert.equal(countOwnedSkins(published, ally.id), 1);
  assert.equal(countSkinsForHero(published, ally.id), 2);
  assert.equal(countOwnedSkins(published, other.id), 1);
  assert.equal(countOwnedSkins(published, "hero-does-not-exist"), 0);
  assert.equal(countOwnedSkins(null, ally.id), 0);
});

// ---------------------------------------------------------------------------
// Quick view model
// ---------------------------------------------------------------------------

test("the quick view of a hero shows its performance", () => {
  const ally = hero({ name: "Yi Sun-shin" });
  const published = collection([ally], []);
  const entry = resolveEntry(published, { kind: "hero", id: ally.id }) as EntryDetails;
  const model = buildQuickViewModel(published, entry);

  assert.equal(model.entry.name, "Yi Sun-shin");
  assert.equal(model.sections.length, 1);
  assert.equal(model.sections[0].id, "performance");
  assert.equal(model.sections[0].emptyMessage, null);
  assert.equal(model.sections[0].rows.length, 5);
});

test("the quick view of a skin shows the skin details and its hero's performance", () => {
  const ally = hero({ name: "Yi Sun-shin" });
  const epic = skin({ heroId: ally.id, rarity: "epic" });
  const published = collection([ally], [epic]);
  const entry = resolveEntry(published, { kind: "skin", id: epic.id }) as EntryDetails;
  const model = buildQuickViewModel(published, entry);

  assert.deepEqual(
    model.sections.map((section) => section.id),
    ["skin-details", "performance"]
  );
  assert.equal(model.sections[0].rows.length, 4);
  assert.equal(model.sections[1].rows.length, 5);
  assert.equal(model.sections[1].emptyMessage, null);
});

test("the quick view of an unlinked skin explains the missing performance", () => {
  const orphan = skin();
  const published = collection([], [orphan]);
  const entry = resolveEntry(published, { kind: "skin", id: orphan.id }) as EntryDetails;
  const model = buildQuickViewModel(published, entry);

  assert.match(String(model.sections[1].emptyMessage), /not linked to a hero/);
});

// ---------------------------------------------------------------------------
// Comparison model
// ---------------------------------------------------------------------------

test("the comparison exposes the two required tabs", () => {
  assert.deepEqual(
    COMPARISON_TABS.map((tab) => tab.id),
    ["skin", "hero-performance"]
  );
  assert.equal(COMPARISON_TABS[0].label, "Skin View");
  assert.equal(COMPARISON_TABS[1].label, "Hero Performance View");
});

test("the skin view tab compares exactly the skin attributes", () => {
  assert.deepEqual(
    COMPARISON_FIELDS.skin.map((field) => field.key),
    ["rarity", "series", "variant", "acquisition"]
  );
});

test("the hero performance tab compares exactly the performance attributes", () => {
  assert.deepEqual(
    COMPARISON_FIELDS["hero-performance"].map((field) => field.key),
    ["mastery", "matches", "win-rate", "primary-role", "skins-owned"]
  );
});

test("both comparison columns stay aligned with the shared field list", () => {
  const ally = hero({ name: "Yi Sun-shin", masteryLevel: 70, winRate: 61.5 });
  const epic = skin({ heroId: ally.id, rarity: "legend", series: "Abyss" });
  const published = collection([ally], [epic]);
  const entries = resolveComparisonEntries(published, [
    { kind: "skin", id: epic.id },
    { kind: "skin", id: epic.id },
  ]);

  const skinModel = buildComparisonModel(published, entries, "skin");
  assert.equal(skinModel.columns.length, 2);
  for (const column of skinModel.columns) {
    assert.deepEqual(
      column.rows.map((row) => row.key),
      COMPARISON_FIELDS.skin.map((field) => field.key)
    );
  }

  const performanceModel = buildComparisonModel(
    published,
    entries,
    "hero-performance"
  );
  for (const column of performanceModel.columns) {
    assert.deepEqual(
      column.rows.map((row) => row.key),
      COMPARISON_FIELDS["hero-performance"].map((field) => field.key)
    );
  }
  assert.equal(
    rowFor(performanceModel.columns[0].rows, "mastery").value,
    "Advanced"
  );
});

test("a hero compared against a skin keeps both columns honest", () => {
  const ally = hero({ name: "Yi Sun-shin", masteryLevel: 70, winRate: 61.5 });
  const epic = skin({ heroId: ally.id, rarity: "legend" });
  const published = collection([ally], [epic]);
  const entries = resolveComparisonEntries(published, [
    { kind: "hero", id: ally.id },
    { kind: "skin", id: epic.id },
  ]);

  const skinModel = buildComparisonModel(published, entries, "skin");
  assert.equal(rowFor(skinModel.columns[0].rows, "rarity").status, "not-applicable");
  assert.equal(rowFor(skinModel.columns[1].rows, "rarity").value, "Legend");

  const performanceModel = buildComparisonModel(
    published,
    entries,
    "hero-performance"
  );
  assert.equal(
    rowFor(performanceModel.columns[0].rows, "mastery").value,
    "Advanced"
  );
  assert.equal(
    rowFor(performanceModel.columns[1].rows, "mastery").value,
    "Advanced",
    "the skin is graded through the same hero"
  );
});

test("the comparison model tolerates an empty pair", () => {
  const model = buildComparisonModel(collection([], []), [], "skin");
  assert.deepEqual(model.columns, []);
  assert.equal(model.fields.length, 4);
});
