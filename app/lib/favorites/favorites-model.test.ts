import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FAVORITES_STORAGE_KEY,
  FAVORITES_STORAGE_VERSION,
  MAX_VISITOR_FAVORITES,
  addVisitorFavorite,
  favoriteKey,
  isVisitorFavorite,
  parseFavoriteRef,
  parseVisitorFavorites,
  removeVisitorFavorite,
  serializeVisitorFavorites,
  toggleVisitorFavorite,
  type FavoriteRef,
} from "./favorites-model.ts";

/**
 * Visitor-favourites model tests (task 05-06).
 *
 * The contract under test:
 *
 * - the storage key and the payload both carry a version, so a future format
 *   change never has to guess how to read old data;
 * - parsing is total: malformed JSON, a wrong version, a wrong shape and
 *   individually broken entries are discarded, never thrown;
 * - a single broken entry does not cost the visitor their other favourites;
 * - the list is de-duplicated, order-stable and bounded.
 */

const heroRef: FavoriteRef = { kind: "hero", id: "hero-1" };
const skinRef: FavoriteRef = { kind: "skin", id: "skin-1" };

test("the storage key carries the schema version", () => {
  assert.match(FAVORITES_STORAGE_KEY, /v\d+$/u);
  assert.equal(FAVORITES_STORAGE_VERSION, 1);
});

test("favourite keys are kind-qualified so a hero and a skin cannot collide", () => {
  assert.equal(favoriteKey(heroRef), "hero:hero-1");
  assert.equal(favoriteKey(skinRef), "skin:skin-1");
});

test("a stored entry is only accepted when kind and id are usable", () => {
  assert.deepEqual(parseFavoriteRef({ kind: "hero", id: "a" }), {
    kind: "hero",
    id: "a",
  });
  assert.deepEqual(parseFavoriteRef({ kind: "skin", id: "  b  " }), {
    kind: "skin",
    id: "b",
  });

  assert.equal(parseFavoriteRef(null), null);
  assert.equal(parseFavoriteRef("hero-1"), null);
  assert.equal(parseFavoriteRef([]), null);
  assert.equal(parseFavoriteRef({ kind: "item", id: "a" }), null);
  assert.equal(parseFavoriteRef({ kind: "hero" }), null);
  assert.equal(parseFavoriteRef({ kind: "hero", id: 7 }), null);
  assert.equal(parseFavoriteRef({ kind: "hero", id: "" }), null);
  assert.equal(parseFavoriteRef({ kind: "hero", id: "   " }), null);
  assert.equal(parseFavoriteRef({ kind: "hero", id: "x".repeat(129) }), null);
});

test("malformed stored data yields an empty list instead of throwing", () => {
  assert.deepEqual(parseVisitorFavorites(null), []);
  assert.deepEqual(parseVisitorFavorites(undefined), []);
  assert.deepEqual(parseVisitorFavorites(""), []);
  assert.deepEqual(parseVisitorFavorites("   "), []);
  assert.deepEqual(parseVisitorFavorites("{not json"), []);
  assert.deepEqual(parseVisitorFavorites("[1,2,3]"), []);
  assert.deepEqual(parseVisitorFavorites('"a string"'), []);
  assert.deepEqual(parseVisitorFavorites("null"), []);
  assert.deepEqual(parseVisitorFavorites("42"), []);
});

test("a payload written by another version is ignored entirely", () => {
  assert.deepEqual(
    parseVisitorFavorites(
      JSON.stringify({ version: 99, entries: [{ kind: "hero", id: "a" }] })
    ),
    []
  );
  assert.deepEqual(
    parseVisitorFavorites(JSON.stringify({ entries: [{ kind: "hero", id: "a" }] })),
    []
  );
});

test("a payload with a broken shape is ignored", () => {
  assert.deepEqual(
    parseVisitorFavorites(JSON.stringify({ version: FAVORITES_STORAGE_VERSION })),
    []
  );
  assert.deepEqual(
    parseVisitorFavorites(
      JSON.stringify({ version: FAVORITES_STORAGE_VERSION, entries: "nope" })
    ),
    []
  );
});

test("a single broken entry does not discard the valid ones", () => {
  const parsed = parseVisitorFavorites(
    JSON.stringify({
      version: FAVORITES_STORAGE_VERSION,
      entries: [
        { kind: "hero", id: "hero-1" },
        { kind: "unknown", id: "x" },
        null,
        "hero-2",
        { kind: "skin", id: "skin-1" },
        { kind: "hero", id: "" },
      ],
    })
  );
  assert.deepEqual(parsed, [heroRef, skinRef]);
});

test("duplicates are removed and the first occurrence wins", () => {
  const parsed = parseVisitorFavorites(
    JSON.stringify({
      version: FAVORITES_STORAGE_VERSION,
      entries: [
        { kind: "hero", id: "hero-1" },
        { kind: "hero", id: "hero-1" },
        { kind: "skin", id: "skin-1" },
      ],
    })
  );
  assert.deepEqual(parsed, [heroRef, skinRef]);
});

test("the parsed list is bounded", () => {
  const entries = Array.from({ length: MAX_VISITOR_FAVORITES + 25 }, (_, index) => ({
    kind: "hero",
    id: `hero-${index}`,
  }));
  const parsed = parseVisitorFavorites(
    JSON.stringify({ version: FAVORITES_STORAGE_VERSION, entries })
  );
  assert.equal(parsed.length, MAX_VISITOR_FAVORITES);
});

test("serialising and parsing round-trips", () => {
  const entries = [heroRef, skinRef];
  const raw = serializeVisitorFavorites(entries);
  assert.deepEqual(parseVisitorFavorites(raw), entries);
  assert.deepEqual(JSON.parse(raw), {
    version: FAVORITES_STORAGE_VERSION,
    entries: [{ kind: "hero", id: "hero-1" }, { kind: "skin", id: "skin-1" }],
  });
});

test("serialising drops anything that is not a valid entry", () => {
  const raw = serializeVisitorFavorites([
    heroRef,
    { kind: "nope" as never, id: "x" },
    { kind: "skin", id: "" },
  ]);
  assert.deepEqual(JSON.parse(raw).entries, [{ kind: "hero", id: "hero-1" }]);
});

test("membership, adding and removing behave as expected", () => {
  const entries: FavoriteRef[] = [];
  assert.equal(isVisitorFavorite(entries, heroRef), false);

  const added = addVisitorFavorite(entries, heroRef);
  assert.deepEqual(added, [heroRef]);
  assert.equal(isVisitorFavorite(added, heroRef), true);

  // Adding twice does not duplicate.
  assert.deepEqual(addVisitorFavorite(added, heroRef), [heroRef]);

  const removed = removeVisitorFavorite(added, heroRef);
  assert.deepEqual(removed, []);
  // Removing something that is not there is a no-op.
  assert.deepEqual(removeVisitorFavorite(removed, heroRef), []);
});

test("toggling flips the membership", () => {
  const once = toggleVisitorFavorite([], heroRef);
  assert.deepEqual(once, [heroRef]);
  const twice = toggleVisitorFavorite(once, heroRef);
  assert.deepEqual(twice, []);
});

test("toggling never mutates the input", () => {
  const entries: FavoriteRef[] = [heroRef];
  const next = toggleVisitorFavorite(entries, skinRef);
  assert.deepEqual(entries, [heroRef]);
  assert.deepEqual(next, [heroRef, skinRef]);
});

test("the list cannot grow past the cap", () => {
  const full = Array.from({ length: MAX_VISITOR_FAVORITES }, (_, index) => ({
    kind: "hero" as const,
    id: `hero-${index}`,
  }));
  assert.deepEqual(addVisitorFavorite(full, { kind: "skin", id: "skin-1" }), full);
});
