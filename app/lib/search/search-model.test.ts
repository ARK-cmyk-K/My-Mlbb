import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_SEARCH_RESULTS,
  SEARCH_CATEGORIES,
  SEARCH_MAX_TOTAL,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_RESULT_LIMIT,
  buildSearchResultHref,
  countSearchResults,
  flattenSearchResults,
  isSearchableQuery,
  normalizeSearchQuery,
  parseSearchPayload,
  searchCategoryLabel,
  type CategorizedSearchResults,
} from "./search-model.ts";

/**
 * Global search model tests (task 06-01).
 *
 * The contract under test:
 *
 * - a query is normalised (trimmed, whitespace-collapsed, control characters
 *   removed, length-bounded) before it is sent anywhere;
 * - the RPC payload is treated as untrusted input: a wrong shape yields empty
 *   lists, malformed items are dropped, and every list is bounded;
 * - the flattened list is index-aligned with the rendered order, so the
 *   keyboard navigation and the screen-reader announcement cannot disagree;
 * - every result links to a public page.
 */

test("a query is trimmed and whitespace-collapsed", () => {
  assert.equal(normalizeSearchQuery("  ling  "), "ling");
  assert.equal(normalizeSearchQuery("abyss   legend"), "abyss legend");
  assert.equal(normalizeSearchQuery("\tling\n"), "ling");
  assert.equal(normalizeSearchQuery(null), "");
  assert.equal(normalizeSearchQuery(undefined), "");
  assert.equal(normalizeSearchQuery(""), "");
});

test("control characters are removed from the query", () => {
  assert.equal(normalizeSearchQuery("li\u0000ng"), "li ng");
  assert.equal(normalizeSearchQuery("li\u0007ng"), "li ng");
  assert.equal(normalizeSearchQuery("li\u001fng"), "li ng");
  assert.equal(normalizeSearchQuery("li\u007fng"), "li ng");
});

test("the query length is bounded", () => {
  const long = "a".repeat(500);
  assert.equal(normalizeSearchQuery(long).length, SEARCH_QUERY_MAX_LENGTH);
});

test("only queries of at least two characters are searchable", () => {
  assert.equal(isSearchableQuery(""), false);
  assert.equal(isSearchableQuery("a"), false);
  assert.equal(isSearchableQuery(" a "), false);
  assert.equal(isSearchableQuery("ab"), true);
  assert.equal(isSearchableQuery("ling"), true);
});

test("a malformed payload yields empty lists instead of throwing", () => {
  assert.deepEqual(parseSearchPayload(null), {
    heroes: [],
    skins: [],
    achievements: [],
    timeline: [],
  });
  assert.deepEqual(parseSearchPayload("nope"), {
    heroes: [],
    skins: [],
    achievements: [],
    timeline: [],
  });
  assert.deepEqual(parseSearchPayload([]), {
    heroes: [],
    skins: [],
    achievements: [],
    timeline: [],
  });
  assert.deepEqual(parseSearchPayload({ heroes: "nope" }).heroes, []);
  assert.deepEqual(parseSearchPayload({ heroes: {} }).heroes, []);
});

test("the RPC payload is mapped onto the four categories", () => {
  const parsed = parseSearchPayload({
    heroes: [{ id: "h1", title: "Ling", subtitle: "Assassin" }],
    skins: [{ id: "s1", title: "Abyss Legend", subtitle: "collector" }],
    achievements: [{ id: "a1", title: "First blood", subtitle: "combat" }],
    timeline_entries: [{ id: "t1", title: "Reached Mythic", subtitle: "rank" }],
  });

  assert.equal(parsed.heroes.length, 1);
  assert.equal(parsed.skins.length, 1);
  assert.equal(parsed.achievements.length, 1);
  assert.equal(parsed.timeline.length, 1);
  assert.equal(parsed.heroes[0].title, "Ling");
  assert.equal(parsed.timeline[0].title, "Reached Mythic");
});

test("items without a usable id or title are dropped", () => {
  const parsed = parseSearchPayload({
    heroes: [
      { id: "h1", title: "Ling" },
      { id: "h2" },
      { title: "No id" },
      { id: 5, title: "Bad id" },
      null,
      "nope",
      { id: "h3", title: "   " },
    ],
  });
  assert.deepEqual(parsed.heroes, [{ id: "h1", title: "Ling", subtitle: null }]);
});

test("a missing subtitle becomes null", () => {
  const parsed = parseSearchPayload({
    heroes: [{ id: "h1", title: "Ling" }],
  });
  assert.equal(parsed.heroes[0].subtitle, null);
});

test("each category is bounded", () => {
  const heroes = Array.from({ length: SEARCH_RESULT_LIMIT + 10 }, (_, index) => ({
    id: `h${index}`,
    title: `Hero ${index}`,
  }));
  const parsed = parseSearchPayload({ heroes });
  assert.equal(parsed.heroes.length, SEARCH_RESULT_LIMIT);
});

test("the result count sums every category", () => {
  const results: CategorizedSearchResults = {
    heroes: [{ id: "h1", title: "Ling", subtitle: null }],
    skins: [{ id: "s1", title: "Skin", subtitle: null }],
    achievements: [],
    timeline: [],
  };
  assert.equal(countSearchResults(results), 2);
  assert.equal(countSearchResults(EMPTY_SEARCH_RESULTS), 0);
});

test("the flattened list follows the category order and is index-aligned", () => {
  const results: CategorizedSearchResults = {
    heroes: [{ id: "h1", title: "Ling", subtitle: null }],
    skins: [{ id: "s1", title: "Skin", subtitle: null }],
    achievements: [{ id: "a1", title: "Achievement", subtitle: null }],
    timeline: [{ id: "t1", title: "Timeline", subtitle: null }],
  };
  const flat = flattenSearchResults(results, "search");
  assert.deepEqual(
    flat.map((entry) => entry.category),
    ["heroes", "skins", "achievements", "timeline"]
  );
  assert.deepEqual(
    flat.map((entry) => entry.index),
    [0, 1, 2, 3]
  );
  assert.equal(flat[0].domId, "search-option-heroes-h1");
  assert.equal(flat[3].domId, "search-option-timeline-t1");
});

test("the flattened list is bounded overall", () => {
  const many = Array.from({ length: SEARCH_RESULT_LIMIT + 5 }, (_, index) => ({
    id: `h${index}`,
    title: `Hero ${index}`,
    subtitle: null,
  }));
  const results: CategorizedSearchResults = {
    heroes: many,
    skins: many,
    achievements: many,
    timeline: many,
  };
  assert.equal(flattenSearchResults(results).length, SEARCH_MAX_TOTAL);
});

test("hero and skin results deep-link into the explorer", () => {
  const hero = { id: "h1", title: "Ling", subtitle: null };
  const skin = { id: "s1", title: "Abyss Legend", subtitle: null };
  assert.equal(
    buildSearchResultHref("heroes", hero),
    "/collection?view=heroes&q=Ling"
  );
  assert.equal(
    buildSearchResultHref("skins", skin),
    "/collection?view=skins&q=Abyss+Legend"
  );
});

test("achievement and timeline results link to the homepage showcase", () => {
  const item = { id: "a1", title: "First blood", subtitle: null };
  assert.equal(buildSearchResultHref("achievements", item), "/");
  assert.equal(buildSearchResultHref("timeline", item), "/");
});

test("every category has a human label", () => {
  for (const category of SEARCH_CATEGORIES) {
    assert.ok(searchCategoryLabel(category.id).length > 0);
  }
});
