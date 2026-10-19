import assert from "node:assert/strict";
import { test } from "node:test";

import type { DraftSkin } from "./contracts.ts";
import {
  EMPTY_SKIN_FORM_VALUES,
  parseSkinForm,
  skinToFormValues,
} from "./skin-form.ts";

/**
 * Form-mapping tests for skin CRUD (task 03-02).
 *
 * These run without a database or a server: `parseSkinForm` is the same function
 * the Server Action calls, so a passing suite means a malformed submission is
 * rejected with field-level issues before any query is issued.
 */

const HERO_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const MEDIA_ID = "9b2f6a10-2c34-4b56-8d78-0a1b2c3d4e5f";

function validSkinForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", "Crimson Vanguard");
  form.set("slug", "crimson-vanguard");
  form.set("heroId", HERO_ID);
  form.set("rarity", "epic");
  form.set("series", "Starlight Carnival");
  form.set("splashArtMediaId", MEDIA_ID);
  form.set("variant", "painted");
  form.set("acquisitionDate", "2025-06-01");
  form.set("acquisitionMilestone", "Anniversary recharge");
  form.set("isOwned", "on");
  form.set("isFavorite", "on");
  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }
  return form;
}

test("parseSkinForm accepts a complete valid submission", () => {
  const result = parseSkinForm(validSkinForm());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
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
    isFavorite: true,
  });
});

test("parseSkinForm treats blank optionals as null and absent checkboxes as false", () => {
  const result = parseSkinForm(
    validSkinForm({
      heroId: "",
      series: "",
      splashArtMediaId: "",
      variant: "",
      acquisitionDate: "",
      acquisitionMilestone: "",
      isOwned: "",
      isFavorite: "",
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    name: "Crimson Vanguard",
    slug: "crimson-vanguard",
    heroId: null,
    rarity: "epic",
    series: null,
    splashArtMediaId: null,
    variant: null,
    acquisitionDate: null,
    acquisitionMilestone: null,
    isOwned: false,
    isFavorite: false,
  });
});

test("parseSkinForm rejects a missing name and rarity", () => {
  const result = parseSkinForm(validSkinForm({ name: "", rarity: "" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes("name"));
  assert.ok(paths.includes("rarity"));
});

test("parseSkinForm rejects an invalid slug and unknown rarity/variant", () => {
  const result = parseSkinForm(
    validSkinForm({ slug: "Not A Slug", rarity: "mythic", variant: "golden" })
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes("slug"));
  assert.ok(paths.includes("rarity"));
  assert.ok(paths.includes("variant"));
});

test("parseSkinForm enforces the acquisition date format and bounds", () => {
  const malformed = parseSkinForm(validSkinForm({ acquisitionDate: "01/06/2025" }));
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.ok(malformed.issues.some((issue) => issue.path === "acquisitionDate"));
  }

  const outOfRange = parseSkinForm(validSkinForm({ acquisitionDate: "2001-01-01" }));
  assert.equal(outOfRange.ok, false);
  if (!outOfRange.ok) {
    assert.ok(
      outOfRange.issues.some((issue) => issue.path === "acquisitionDate")
    );
  }
});

test("parseSkinForm enforces the series and milestone length limits", () => {
  const result = parseSkinForm(
    validSkinForm({
      series: "s".repeat(161),
      acquisitionMilestone: "m".repeat(161),
    })
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes("series"));
  assert.ok(paths.includes("acquisitionMilestone"));
});

test("parseSkinForm rejects a non-UUID hero association before it reaches PostgREST", () => {
  const result = parseSkinForm(validSkinForm({ heroId: "not-a-uuid" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, [
    { path: "heroId", message: "must be the UUID of an existing hero" },
  ]);
});

test("parseSkinForm rejects a non-UUID splash art reference", () => {
  const result = parseSkinForm(validSkinForm({ splashArtMediaId: "hero-1" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, [
    {
      path: "splashArtMediaId",
      message: "must be the UUID of an existing media item",
    },
  ]);
});

test("parseSkinForm reports both bad references together", () => {
  const result = parseSkinForm(
    validSkinForm({ heroId: "hero-1", splashArtMediaId: "media-1" })
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.issues.map((issue) => issue.path),
    ["heroId", "splashArtMediaId"]
  );
});

test("skinToFormValues round-trips through parseSkinForm", () => {
  const skin: DraftSkin = {
    id: "skin-0001",
    name: "Crimson Vanguard",
    slug: "crimson-vanguard",
    heroId: HERO_ID,
    rarity: "legend",
    series: "Annual Gala",
    splashArtMediaId: MEDIA_ID,
    variant: "model",
    acquisitionDate: "2024-12-31",
    acquisitionMilestone: "Top-up event",
    isOwned: true,
    isFavorite: false,
    publicationState: "draft",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const values = skinToFormValues(skin);
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "boolean") {
      if (value) form.set(key, "on");
    } else {
      form.set(key, value);
    }
  }

  const result = parseSkinForm(form);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    name: skin.name,
    slug: skin.slug,
    heroId: skin.heroId,
    rarity: skin.rarity,
    series: skin.series,
    splashArtMediaId: skin.splashArtMediaId,
    variant: skin.variant,
    acquisitionDate: skin.acquisitionDate,
    acquisitionMilestone: skin.acquisitionMilestone,
    isOwned: skin.isOwned,
    isFavorite: skin.isFavorite,
  });
});

test("EMPTY_SKIN_FORM_VALUES has no preselected values", () => {
  assert.equal(EMPTY_SKIN_FORM_VALUES.name, "");
  assert.equal(EMPTY_SKIN_FORM_VALUES.heroId, "");
  assert.equal(EMPTY_SKIN_FORM_VALUES.rarity, "");
  assert.equal(EMPTY_SKIN_FORM_VALUES.isOwned, false);
  assert.equal(EMPTY_SKIN_FORM_VALUES.isFavorite, false);
});
