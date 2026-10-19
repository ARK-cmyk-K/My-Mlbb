import assert from "node:assert/strict";
import { test } from "node:test";

import type { DraftHero } from "./contracts.ts";
import {
  EMPTY_HERO_FORM_VALUES,
  heroToFormValues,
  issuesByPath,
  isUuid,
  parseHeroForm,
  slugify,
} from "./hero-form.ts";

/**
 * Form-mapping tests for hero CRUD (task 03-01).
 *
 * These run without a database or a server: `parseHeroForm` is the same function
 * the Server Action calls, so a passing suite means a malformed submission is
 * rejected with field-level issues before any query is issued.
 */

function validHeroForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", "Layla");
  form.set("slug", "layla");
  form.set("primaryRole", "marksman");
  form.set("secondaryRole", "mage");
  form.set("specialty", "Burst damage");
  form.set("portraitMediaId", "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  form.set("masteryLevel", "42");
  form.set("totalMatches", "1200");
  form.set("winRate", "61.25");
  form.set("isSignature", "on");
  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }
  return form;
}

test("parseHeroForm accepts a complete valid submission", () => {
  const result = parseHeroForm(validHeroForm());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    name: "Layla",
    slug: "layla",
    primaryRole: "marksman",
    secondaryRole: "mage",
    specialty: "Burst damage",
    portraitMediaId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    masteryLevel: 42,
    totalMatches: 1200,
    winRate: 61.25,
    isSignature: true,
    isFavorite: false,
  });
});

test("parseHeroForm treats blank optionals as null and absent checkboxes as false", () => {
  const form = validHeroForm({
    secondaryRole: "",
    specialty: "",
    portraitMediaId: "",
    winRate: "",
  });
  form.delete("isSignature");
  const result = parseHeroForm(form);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.secondaryRole, null);
  assert.equal(result.value.specialty, null);
  assert.equal(result.value.portraitMediaId, null);
  assert.equal(result.value.winRate, null);
  assert.equal(result.value.isSignature, false);
});

test("parseHeroForm reports required fields", () => {
  const missingName = parseHeroForm(validHeroForm({ name: "" }));
  assert.equal(missingName.ok, false);
  if (!missingName.ok) {
    assert.ok(missingName.issues.some((issue) => issue.path === "name"));
  }

  const missingRole = parseHeroForm(validHeroForm({ primaryRole: "" }));
  assert.equal(missingRole.ok, false);
  if (!missingRole.ok) {
    assert.ok(missingRole.issues.some((issue) => issue.path === "primaryRole"));
  }
});

test("parseHeroForm rejects a bad slug and a duplicate role", () => {
  const badSlug = parseHeroForm(validHeroForm({ slug: "Not A Slug!" }));
  assert.equal(badSlug.ok, false);
  if (!badSlug.ok) {
    assert.ok(badSlug.issues.some((issue) => issue.path === "slug"));
  }

  const duplicateRoles = parseHeroForm(validHeroForm({ secondaryRole: "marksman" }));
  assert.equal(duplicateRoles.ok, false);
  if (!duplicateRoles.ok) {
    assert.ok(duplicateRoles.issues.some((issue) => issue.path === "secondaryRole"));
  }
});

test("parseHeroForm enforces numeric bounds", () => {
  const tooHigh = parseHeroForm(validHeroForm({ masteryLevel: "150" }));
  assert.equal(tooHigh.ok, false);
  if (!tooHigh.ok) {
    assert.ok(tooHigh.issues.some((issue) => issue.path === "masteryLevel"));
  }

  const notANumber = parseHeroForm(validHeroForm({ totalMatches: "lots" }));
  assert.equal(notANumber.ok, false);
  if (!notANumber.ok) {
    assert.ok(notANumber.issues.some((issue) => issue.path === "totalMatches"));
  }

  const badWinRate = parseHeroForm(validHeroForm({ winRate: "120" }));
  assert.equal(badWinRate.ok, false);
  if (!badWinRate.ok) {
    assert.ok(badWinRate.issues.some((issue) => issue.path === "winRate"));
  }
});

test("parseHeroForm requires a UUID portrait media id", () => {
  const notUuid = parseHeroForm(validHeroForm({ portraitMediaId: "not-a-uuid" }));
  assert.equal(notUuid.ok, false);
  if (!notUuid.ok) {
    assert.ok(notUuid.issues.some((issue) => issue.path === "portraitMediaId"));
  }
});

test("issuesByPath keeps the first message per field", () => {
  const map = issuesByPath([
    { path: "name", message: "first" },
    { path: "name", message: "second" },
    { path: "slug", message: "only" },
  ]);
  assert.deepEqual(map, { name: "first", slug: "only" });
  assert.deepEqual(issuesByPath(undefined), {});
});

test("heroToFormValues round-trips a stored hero", () => {
  const hero: DraftHero = {
    id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    name: "Layla",
    slug: "layla",
    primaryRole: "marksman",
    secondaryRole: null,
    specialty: null,
    portraitMediaId: null,
    masteryLevel: 42,
    totalMatches: 1200,
    winRate: 61.25,
    isSignature: true,
    isFavorite: false,
    publicationState: "draft",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const values = heroToFormValues(hero);
  assert.deepEqual(values, {
    name: "Layla",
    slug: "layla",
    primaryRole: "marksman",
    secondaryRole: "",
    specialty: "",
    portraitMediaId: "",
    masteryLevel: "42",
    totalMatches: "1200",
    winRate: "61.25",
    isSignature: true,
    isFavorite: false,
  });

  const reParsed = parseHeroForm(formFromValues(values));
  assert.equal(reParsed.ok, true);
  if (reParsed.ok) {
    assert.equal(reParsed.value.name, hero.name);
    assert.equal(reParsed.value.winRate, hero.winRate);
  }
});

test("slugify produces schema-valid slugs", () => {
  assert.equal(slugify("Layla"), "layla");
  assert.equal(slugify("  Chou  "), "chou");
  assert.equal(slugify("Yi Sun-shin"), "yi-sun-shin");
  assert.equal(slugify("Aulus!!!"), "aulus");
  assert.equal(slugify("Tigréal"), "tigreal");
  assert.equal(slugify("---"), "");
  assert.ok(slugify("A".repeat(200)).length <= 140);
});

test("isUuid matches canonical UUIDs only", () => {
  assert.equal(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301"), true);
  assert.equal(isUuid("3F2504E0-4F89-41D3-9A0C-0305E82C3301"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("3f2504e04f8941d39a0c0305e82c3301"), false);
});

test("EMPTY_HERO_FORM_VALUES parses as a valid starter except required fields", () => {
  const result = parseHeroForm(formFromValues(EMPTY_HERO_FORM_VALUES));
  assert.equal(result.ok, false);
  if (!result.ok) {
    const paths = result.issues.map((issue) => issue.path);
    assert.ok(paths.includes("name"));
    assert.ok(paths.includes("slug"));
    assert.ok(paths.includes("primaryRole"));
  }
});

/** Builds a form submission from the string/boolean shape the DOM produces. */
function formFromValues(values: {
  [K in keyof import("./hero-form.ts").HeroFormValues]: string | boolean;
}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "boolean") {
      if (value) form.set(key, "on");
    } else {
      form.set(key, value);
    }
  }
  return form;
}
