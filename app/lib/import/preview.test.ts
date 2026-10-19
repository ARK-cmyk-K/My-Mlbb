import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HERO_CSV_COLUMNS,
  SKIN_CSV_COLUMNS,
} from "./columns.ts";
import {
  buildImportPreview,
  type ImportReferences,
} from "./preview.ts";

/**
 * Dry-run preview tests (task 03-03).
 *
 * Covers the required categories: valid data, invalid values, duplicate keys,
 * invalid references and header problems. The builder is pure, so these run
 * without Supabase.
 */

const HERO_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const MEDIA_ID = "9b2f6a10-2c34-4b56-8d78-0a1b2c3d4e5f";

const NO_REFERENCES: ImportReferences = { existingSlugs: [], heroes: [] };

type HeroColumn = (typeof HERO_CSV_COLUMNS)[number];
type SkinColumn = (typeof SKIN_CSV_COLUMNS)[number];

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
  return HERO_CSV_COLUMNS.map((column) => overrides[column] ?? base[column]);
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
  return SKIN_CSV_COLUMNS.map((column) => overrides[column] ?? base[column]);
}

function csv(
  header: readonly string[],
  rows: readonly (readonly string[])[]
): string[][] {
  return [[...header], ...rows.map((row) => [...row])];
}

test("previews a valid hero as a new row", () => {
  const result = buildImportPreview(
    "heroes",
    csv(HERO_CSV_COLUMNS, [heroRow()]),
    NO_REFERENCES
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.preview, {
    entity: "heroes",
    totalRows: 1,
    newRows: [{ row: 2, slug: "layla", name: "Layla", action: "new" }],
    existingRows: [],
    errors: [],
  });
});

test("classifies a row with an existing slug as a candidate", () => {
  const result = buildImportPreview(
    "heroes",
    csv(HERO_CSV_COLUMNS, [heroRow()]),
    { existingSlugs: ["layla"], heroes: [] }
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.preview.existingRows, [
    { row: 2, slug: "layla", name: "Layla", action: "existing" },
  ]);
  assert.equal(result.preview.newRows.length, 0);
});

test("flags a duplicate slug inside the file on the later row", () => {
  const result = buildImportPreview(
    "heroes",
    csv(HERO_CSV_COLUMNS, [
      heroRow(),
      heroRow({ name: "Layla Again" }),
    ]),
    NO_REFERENCES
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.preview.newRows.length, 1);
  assert.equal(result.preview.errors.length, 1);
  assert.equal(result.preview.errors[0].row, 3);
  assert.match(result.preview.errors[0].issues[0].message, /duplicate slug/);
});

test("reports invalid enum, range and boolean values with column names", () => {
  const result = buildImportPreview(
    "heroes",
    csv(HERO_CSV_COLUMNS, [
      heroRow({
        primary_role: "wizard",
        mastery_level: "101",
        win_rate: "not-a-number",
        is_favorite: "maybe",
      }),
    ]),
    NO_REFERENCES
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const error = result.preview.errors[0];
  const paths = error.issues.map((issue) => issue.path);
  assert.ok(paths.includes("primary_role"));
  assert.ok(paths.includes("mastery_level"));
  assert.ok(paths.includes("win_rate"));
  assert.ok(paths.includes("is_favorite"));
});

test("rejects a header row with a missing column", () => {
  const header = HERO_CSV_COLUMNS.slice(0, -1);
  const result = buildImportPreview(
    "heroes",
    [[...header], heroRow().slice(0, -1)],
    NO_REFERENCES
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /missing "is_favorite"/);
  }
});

test("rejects a header row with an unexpected column", () => {
  const result = buildImportPreview(
    "heroes",
    [[...HERO_CSV_COLUMNS, "notes"], [...heroRow(), "hi"]],
    NO_REFERENCES
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /unexpected "notes"/);
  }
});

test("rejects a repeated header column", () => {
  const result = buildImportPreview(
    "heroes",
    [[...HERO_CSV_COLUMNS, "name"], [...heroRow(), "Copy"]],
    NO_REFERENCES
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /repeats "name"/);
  }
});

test("ignores blank rows and keeps spreadsheet row numbers", () => {
  const blank: string[] = HERO_CSV_COLUMNS.map(() => "");
  const result = buildImportPreview(
    "heroes",
    csv(HERO_CSV_COLUMNS, [
      heroRow(),
      blank,
      heroRow({ name: "Gusion", slug: "gusion" }),
    ]),
    NO_REFERENCES
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.preview.totalRows, 2);
  assert.deepEqual(
    result.preview.newRows.map((row) => row.row),
    [2, 4]
  );
});

test("previews a valid skin and resolves the hero slug", () => {
  const result = buildImportPreview(
    "skins",
    csv(SKIN_CSV_COLUMNS, [skinRow()]),
    { existingSlugs: [], heroes: [{ id: HERO_ID, slug: "layla" }] }
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.preview.newRows, [
    { row: 2, slug: "crimson-vanguard", name: "Crimson Vanguard", action: "new" },
  ]);
  assert.deepEqual(result.preview.errors, []);
});

test("accepts case-insensitive enums, booleans and hero slugs", () => {
  const result = buildImportPreview(
    "skins",
    csv(SKIN_CSV_COLUMNS, [
      skinRow({
        hero_slug: "Layla",
        rarity: "Epic",
        variant: "Model",
        is_owned: "YES",
        is_favorite: "0",
      }),
    ]),
    { existingSlugs: [], heroes: [{ id: HERO_ID, slug: "layla" }] }
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.preview.errors, []);
  assert.equal(result.preview.newRows.length, 1);
});

test("allows a skin without a hero association", () => {
  const result = buildImportPreview(
    "skins",
    csv(SKIN_CSV_COLUMNS, [skinRow({ hero_slug: "" })]),
    NO_REFERENCES
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.preview.errors, []);
});

test("flags invalid skin references and values", () => {
  const result = buildImportPreview(
    "skins",
    csv(SKIN_CSV_COLUMNS, [
      skinRow({
        hero_slug: "missing-hero",
        rarity: "mythic",
        splash_art_media_id: "not-a-uuid",
        acquisition_date: "01/06/2025",
        is_owned: "sometimes",
      }),
    ]),
    { existingSlugs: [], heroes: [{ id: HERO_ID, slug: "layla" }] }
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const paths = result.preview.errors[0].issues.map((issue) => issue.path);
  assert.ok(paths.includes("hero_slug"));
  assert.ok(paths.includes("rarity"));
  assert.ok(paths.includes("splash_art_media_id"));
  assert.ok(paths.includes("acquisition_date"));
  assert.ok(paths.includes("is_owned"));
});

test("classifies an existing skin slug", () => {
  const result = buildImportPreview(
    "skins",
    csv(SKIN_CSV_COLUMNS, [skinRow()]),
    {
      existingSlugs: ["crimson-vanguard"],
      heroes: [{ id: HERO_ID, slug: "layla" }],
    }
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.preview.existingRows.length, 1);
});

test("rejects an empty upload", () => {
  const result = buildImportPreview("heroes", [], NO_REFERENCES);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /CSV is empty/);
  }
});
