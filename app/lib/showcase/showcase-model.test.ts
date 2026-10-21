import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  PublishedAchievement,
  PublishedHero,
  PublishedRelease,
  PublishedSkin,
  PublishedTimelineEntry,
} from "../content/contracts.ts";
import {
  buildShowcaseModel,
  formatCount,
  formatDate,
  formatEnumLabel,
  HIGH_RARITY_SKINS,
  initialsFromName,
  RECENT_ACHIEVEMENT_LIMIT,
  resolveTabKeyIndex,
  SHOWCASE_TAB_IDS,
  SHOWCASE_TABS,
} from "./showcase-model.ts";

/**
 * Unit tests for the showcase view model (task 05-03).
 *
 * The model is the only place that decides *which* published entries appear in
 * the tabs and in what order, so these tests cover the selection, ordering and
 * empty-state rules the components rely on. Component markup itself is covered
 * by the typecheck/build; DOM tests would need a browser harness this project
 * does not ship.
 */

const PUBLISHED_AT = "2026-01-01T00:00:00.000Z";

function hero(
  id: string,
  name: string,
  overrides: Partial<PublishedHero> = {}
): PublishedHero {
  return {
    id,
    releaseId: "release-1",
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    primaryRole: "mage",
    secondaryRole: null,
    specialty: null,
    portraitMediaId: null,
    masteryLevel: 0,
    totalMatches: 0,
    winRate: null,
    isSignature: false,
    isFavorite: false,
    publishedAt: PUBLISHED_AT,
    ...overrides,
  };
}

function skin(
  id: string,
  name: string,
  rarity: PublishedSkin["rarity"],
  overrides: Partial<PublishedSkin> = {}
): PublishedSkin {
  return {
    id,
    releaseId: "release-1",
    heroId: null,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    rarity,
    series: null,
    splashArtMediaId: null,
    variant: null,
    acquisitionDate: null,
    acquisitionMilestone: null,
    isOwned: true,
    isFavorite: false,
    publishedAt: PUBLISHED_AT,
    ...overrides,
  };
}

function achievement(
  id: string,
  title: string,
  earnedOn: string | null,
  overrides: Partial<PublishedAchievement> = {}
): PublishedAchievement {
  return {
    id,
    releaseId: "release-1",
    title,
    description: null,
    category: "rank",
    earnedOn,
    iconMediaId: null,
    publishedAt: PUBLISHED_AT,
    ...overrides,
  };
}

function timelineEntry(
  id: string,
  title: string,
  occurredOn: string,
  overrides: Partial<PublishedTimelineEntry> = {}
): PublishedTimelineEntry {
  return {
    id,
    releaseId: "release-1",
    title,
    body: null,
    kind: "milestone",
    occurredOn,
    mediaId: null,
    isHighlight: false,
    publishedAt: PUBLISHED_AT,
    ...overrides,
  };
}

function release(
  overrides: Partial<PublishedRelease> = {}
): PublishedRelease {
  return {
    release: {
      id: "release-1",
      name: "Release 1",
      publishedAt: PUBLISHED_AT,
      updatedAt: PUBLISHED_AT,
    },
    heroes: [],
    skins: [],
    achievements: [],
    timelineEntries: [],
    ...overrides,
  };
}

test("tab definitions stay in sync with the tab id list", () => {
  assert.deepEqual(
    SHOWCASE_TABS.map((tab) => tab.id),
    [...SHOWCASE_TAB_IDS]
  );
  for (const tab of SHOWCASE_TABS) {
    assert.ok(tab.label.length > 0, `${tab.id} needs a label`);
    assert.ok(
      tab.emptyMessage.length > 0,
      `${tab.id} needs an empty-state message`
    );
  }
});

test("signature tab keeps only published signature heroes, best mastery first", () => {
  const model = buildShowcaseModel(
    release({
      heroes: [
        hero("h1", "Alpha", { isSignature: true, masteryLevel: 12 }),
        hero("h2", "Bravo", { isSignature: false, masteryLevel: 99 }),
        hero("h3", "Charlie", { isSignature: true, masteryLevel: 40 }),
        hero("h4", "Delta", { isSignature: true, masteryLevel: 12, totalMatches: 300 }),
      ],
    })
  );

  assert.deepEqual(
    model.signatureHeroes.map((entry) => entry.id),
    ["h3", "h4", "h1"]
  );
});

test("skin tab keeps only collector/legend/epic and ranks rarity first", () => {
  assert.deepEqual([...HIGH_RARITY_SKINS], ["collector", "legend", "epic"]);

  const model = buildShowcaseModel(
    release({
      skins: [
        skin("s1", "Basic Skin", "basic"),
        skin("s2", "Epic Skin", "epic", { acquisitionDate: "2024-05-01" }),
        skin("s3", "Old Collector", "collector", { acquisitionDate: "2021-01-01" }),
        skin("s4", "New Collector", "collector", { acquisitionDate: "2025-02-01" }),
        skin("s5", "Legend Skin", "legend"),
        skin("s6", "Starlight Skin", "starlight"),
      ],
    })
  );

  assert.deepEqual(
    model.topRaritySkins.map((entry) => entry.id),
    // rarity rank first (collector > legend > epic), then newest acquisition.
    ["s4", "s3", "s5", "s2"]
  );
});

test("achievement tab sorts newest first, puts undated last, and caps the list", () => {
  const entries = [
    achievement("a1", "Undated", null),
    achievement("a2", "Older", "2023-01-01"),
    achievement("a3", "Newest", "2026-02-01"),
  ];
  for (let index = 0; index < 10; index += 1) {
    entries.push(
      achievement(
        `extra-${index}`,
        `Extra ${index}`,
        `2024-01-${String(index + 1).padStart(2, "0")}`
      )
    );
  }

  const model = buildShowcaseModel(release({ achievements: entries }));

  assert.equal(model.recentAchievements.length, RECENT_ACHIEVEMENT_LIMIT);
  assert.equal(model.recentAchievements[0].id, "a3");
  assert.equal(
    model.recentAchievements.at(-1)?.earnedOn === null,
    false,
    "undated achievements never outrank dated ones"
  );
  assert.ok(
    model.recentAchievements.every((entry) => entry.id !== "a1"),
    "undated entry is pushed out by the dated entries"
  );
});

test("timeline is newest first and preserves highlight flags", () => {
  const model = buildShowcaseModel(
    release({
      timelineEntries: [
        timelineEntry("t1", "First mythic", "2022-04-01", { isHighlight: true }),
        timelineEntry("t2", "Collector unlocked", "2024-08-15"),
        timelineEntry("t3", "Season reset", "2023-01-10"),
      ],
    })
  );

  assert.deepEqual(
    model.timelineEntries.map((entry) => entry.id),
    ["t2", "t3", "t1"]
  );
  assert.equal(model.timelineEntries.at(-1)?.isHighlight, true);
});

test("no published release yields empty sections instead of placeholders", () => {
  for (const input of [null, undefined, release()]) {
    const model = buildShowcaseModel(input);
    assert.deepEqual(model.signatureHeroes, []);
    assert.deepEqual(model.topRaritySkins, []);
    assert.deepEqual(model.recentAchievements, []);
    assert.deepEqual(model.timelineEntries, []);
  }
});

test("deriving the model does not mutate the published release arrays", () => {
  const heroes = [
    hero("h1", "Alpha", { isSignature: true, masteryLevel: 1 }),
    hero("h2", "Bravo", { isSignature: true, masteryLevel: 9 }),
  ];
  const achievements = [
    achievement("a1", "Old", "2020-01-01"),
    achievement("a2", "New", "2026-01-01"),
  ];
  const entries = [
    timelineEntry("t1", "Old", "2020-01-01"),
    timelineEntry("t2", "New", "2026-01-01"),
  ];
  const published = release({ heroes, achievements, timelineEntries: entries });

  buildShowcaseModel(published);

  assert.deepEqual(
    heroes.map((entry) => entry.id),
    ["h1", "h2"]
  );
  assert.deepEqual(
    achievements.map((entry) => entry.id),
    ["a1", "a2"]
  );
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["t1", "t2"]
  );
});

test("arrow/Home/End keys move through the tablist with wrapping", () => {
  assert.equal(resolveTabKeyIndex("ArrowRight", 0, 3), 1);
  assert.equal(resolveTabKeyIndex("ArrowRight", 2, 3), 0);
  assert.equal(resolveTabKeyIndex("ArrowLeft", 0, 3), 2);
  assert.equal(resolveTabKeyIndex("ArrowLeft", 1, 3), 0);
  assert.equal(resolveTabKeyIndex("Home", 2, 3), 0);
  assert.equal(resolveTabKeyIndex("End", 0, 3), 2);
});

test("unhandled keys and empty tablists do not move focus", () => {
  assert.equal(resolveTabKeyIndex("Enter", 1, 3), null);
  assert.equal(resolveTabKeyIndex("Tab", 1, 3), null);
  assert.equal(resolveTabKeyIndex("ArrowRight", 0, 0), null);
});

test("an out-of-range current index is treated as the first tab", () => {
  assert.equal(resolveTabKeyIndex("ArrowRight", 99, 3), 1);
  assert.equal(resolveTabKeyIndex("ArrowLeft", -4, 3), 2);
});

test("enum labels and initials are deterministic", () => {
  assert.equal(formatEnumLabel("collector"), "Collector");
  assert.equal(formatEnumLabel(""), "");
  assert.equal(initialsFromName("Yi Sun-shin"), "YS");
  assert.equal(initialsFromName("  layla  "), "L");
  assert.equal(initialsFromName("   "), "?");
});

test("count and date formatting is locale-stable", () => {
  assert.equal(formatCount(1234567), "1,234,567");
  assert.equal(formatDate("2024-03-01"), "Mar 1, 2024");
  assert.equal(formatDate("2024-03-01T23:30:00.000Z"), "Mar 1, 2024");
  assert.equal(formatDate(null), null);
  assert.equal(formatDate("not-a-date"), null);
});
