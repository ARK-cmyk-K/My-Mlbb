import assert from "node:assert/strict";
import { test } from "node:test";

import {
  validateHeroInput,
  validateHomepageSections,
  validateSkinInput,
  validateTimelineEntryInput,
} from "./validation.ts";

/**
 * Unit tests for the content-service validators (task 02-03).
 *
 * Each rule here mirrors a CHECK/enum in the core-schema migration. The tests
 * assert the *pure* decision (accept / reject with a field path) so they run
 * with no database; the database remains the final authority at runtime.
 */

// ---- valid payloads --------------------------------------------------------

test("validateHeroInput accepts a minimal hero and fills defaults", () => {
  const result = validateHeroInput({
    name: "Gusion",
    slug: "gusion",
    primaryRole: "assassin",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    name: "Gusion",
    slug: "gusion",
    primaryRole: "assassin",
    secondaryRole: null,
    specialty: null,
    portraitMediaId: null,
    masteryLevel: 0,
    totalMatches: 0,
    winRate: null,
    isSignature: false,
    isFavorite: false,
  });
});

test("validateHeroInput trims strings and rounds winRate to numeric(5,2)", () => {
  const result = validateHeroInput({
    name: "  Gusion  ",
    slug: "gusion",
    primaryRole: "assassin",
    winRate: 61.2349,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, "Gusion");
  assert.equal(result.value.winRate, 61.23);
});

test("validateSkinInput accepts a minimal skin", () => {
  const result = validateSkinInput({
    name: "Bloody Raven",
    slug: "bloody-raven",
    rarity: "epic",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.slug, "bloody-raven");
  assert.equal(result.value.rarity, "epic");
  assert.equal(result.value.heroId, null);
});

test("validateTimelineEntryInput accepts a minimal entry", () => {
  const result = validateTimelineEntryInput({
    title: "Reached Mythic",
    kind: "milestone",
    occurredOn: "2026-03-01",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.occurredOn, "2026-03-01");
  assert.equal(result.value.isHighlight, false);
});

// ---- non-object inputs -----------------------------------------------------

test("validators reject non-object payloads with an empty path", () => {
  for (const input of [null, undefined, 42, "hero", ["hero"]]) {
    const hero = validateHeroInput(input);
    assert.equal(hero.ok, false);
    if (hero.ok) continue;
    assert.deepEqual(hero.issues, [{ path: "", message: "must be an object" }]);
  }
});

// ---- hero field rules ------------------------------------------------------

test("validateHeroInput reports the offending field paths", () => {
  const result = validateHeroInput({ name: "", slug: "Bad Slug", primaryRole: "wizard" });

  assert.equal(result.ok, false);
  if (result.ok) return;
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes("name"), "name must be reported");
  assert.ok(paths.includes("slug"), "slug must be reported");
  assert.ok(paths.includes("primaryRole"), "primaryRole must be reported");
});

test("validateHeroInput enforces the slug pattern", () => {
  const bad = validateHeroInput({
    name: "Ok",
    slug: "not_a_slug",
    primaryRole: "tank",
  });
  assert.equal(bad.ok, false);

  const good = validateHeroInput({
    name: "Ok",
    slug: "a-1-b",
    primaryRole: "tank",
  });
  assert.equal(good.ok, true);
});

test("validateHeroInput rejects a secondary role equal to the primary", () => {
  const result = validateHeroInput({
    name: "Ok",
    slug: "ok",
    primaryRole: "tank",
    secondaryRole: "tank",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path === "secondaryRole"));
});

test("validateHeroInput bounds masteryLevel and winRate", () => {
  const result = validateHeroInput({
    name: "Ok",
    slug: "ok",
    primaryRole: "tank",
    masteryLevel: 101,
    winRate: 120,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path === "masteryLevel"));
  assert.ok(result.issues.some((issue) => issue.path === "winRate"));
});

// ---- skin field rules ------------------------------------------------------

test("validateSkinInput rejects an unknown rarity", () => {
  const result = validateSkinInput({
    name: "Ok",
    slug: "ok",
    rarity: "mythic",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path === "rarity"));
});

test("validateSkinInput validates the ISO date and its bounds", () => {
  const malformed = validateSkinInput({
    name: "Ok",
    slug: "ok",
    rarity: "basic",
    acquisitionDate: "01/02/2026",
  });
  assert.equal(malformed.ok, false);

  const outOfRange = validateSkinInput({
    name: "Ok",
    slug: "ok",
    rarity: "basic",
    acquisitionDate: "2001-01-01",
  });
  assert.equal(outOfRange.ok, false);

  const valid = validateSkinInput({
    name: "Ok",
    slug: "ok",
    rarity: "basic",
    acquisitionDate: "2026-01-02",
  });
  assert.equal(valid.ok, true);
});

// ---- timeline field rules --------------------------------------------------

test("validateTimelineEntryInput requires an occurredOn date", () => {
  const result = validateTimelineEntryInput({
    title: "Something",
    kind: "event",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path === "occurredOn"));
});

test("validateTimelineEntryInput rejects an unknown kind", () => {
  const result = validateTimelineEntryInput({
    title: "Something",
    kind: "saga",
    occurredOn: "2026-01-01",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path === "kind"));
});

// ---- homepage sections -----------------------------------------------------

test("validateHomepageSections rejects duplicate positions", () => {
  const result = validateHomepageSections([
    { sectionId: "heroes", position: 0 },
    { sectionId: "skins", position: 0 },
  ]);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.message.includes("unique")));
});

test("validateHomepageSections enforces the section-id pattern", () => {
  const result = validateHomepageSections([
    { sectionId: "Bad-Id", position: 0 },
  ]);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => issue.path === "[0].sectionId"));
});

test("validateHomepageSections accepts a well-formed list", () => {
  const result = validateHomepageSections([
    { sectionId: "heroes", position: 0, isEnabled: true },
    { sectionId: "recent_matches", position: 1 },
  ]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.length, 2);
  assert.equal(result.value[1].isEnabled, false);
});
