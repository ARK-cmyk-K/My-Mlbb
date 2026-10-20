import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createInMemoryContentService,
  type InMemoryActor,
} from "../content/in-memory-service.ts";
import type { DraftHero } from "../content/contracts.ts";
import { commitMergePreview } from "./merge-commit.ts";
import { createMemoryMergePreviewStore } from "./preview-store.ts";
import { buildMergePreview } from "./merge.ts";

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

function heroRow(overrides: Partial<Record<(typeof HERO_COLUMNS)[number], string>> = {}) {
  const base = {
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

const ADMIN: InMemoryActor = { authenticated: true, admin: true, configured: true };
const NON_ADMIN: InMemoryActor = { authenticated: true, admin: false, configured: true };

function csv(rows: string[][]) {
  return [[...HERO_COLUMNS], ...rows.map((row) => [...row])];
}

test("non-admin cannot commit a preview", async () => {
  const service = createInMemoryContentService({ actor: NON_ADMIN });
  const store = createMemoryMergePreviewStore();
  const preview = buildMergePreview("heroes", csv([heroRow()]), {
    existingSlugs: [],
    heroes: [],
    skins: [],
  });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const id = store.put(preview.payload);
  const result = await commitMergePreview({ service, store }, { previewId: id, resolutions: [{ row: 2, action: "include", fields: {} }] });
  assert.equal(result.ok, false);
});

test("stale preview (collection changed) is rejected", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });
  const store = createMemoryMergePreviewStore();
  const preview = buildMergePreview("heroes", csv([heroRow()]), {
    existingSlugs: [],
    heroes: [],
    skins: [],
  });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const id = store.put(preview.payload);
  // mutate collection
  await service.createDraftHero({
    name: "Other",
    slug: "layla", // same slug — will create classification conflict? create will throw CONFLICT in in-memory? let us see
    primaryRole: "marksman",
    secondaryRole: null,
    specialty: null,
    portraitMediaId: null,
    masteryLevel: 0,
    totalMatches: 0,
    winRate: null,
    isSignature: false,
    isFavorite: false,
  });
  const result = await commitMergePreview({ service, store }, { previewId: id, resolutions: [{ row: 2, action: "include", fields: {} }] });
  assert.equal(result.ok, false);
});

test("invalid selections are rejected", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });
  const store = createMemoryMergePreviewStore();
  const preview = buildMergePreview("heroes", csv([heroRow()]), {
    existingSlugs: [],
    heroes: [],
    skins: [],
  });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const id = store.put(preview.payload);
  const result = await commitMergePreview({ service, store }, { previewId: id, resolutions: "not-array" });
  assert.equal(result.ok, false);
});

test("happy path creates new row and reports summary", async () => {
  const service = createInMemoryContentService({ actor: ADMIN });
  const store = createMemoryMergePreviewStore();
  const preview = buildMergePreview("heroes", csv([heroRow()]), {
    existingSlugs: [],
    heroes: [],
    skins: [],
  });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const id = store.put(preview.payload);
  const result = await commitMergePreview({ service, store }, { previewId: id, resolutions: [{ row: 2, action: "include", fields: {} }] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.created, 1);
  assert.equal(result.summary.failed, 0);
});
