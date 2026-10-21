import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublishedHero, PublishedSkin } from "../content/contracts.ts";
import { HERO_ROLES, SKIN_RARITIES } from "../content/validation.ts";
import {
  buildExplorerFacets,
  clearExplorerFilters,
  countActiveFilters,
  explorerStateKey,
  explorerStateToParams,
  explorerStateToSearch,
  EXPLORER_PAGE_SIZE,
  filterHeroesForExplorer,
  filterSkinsForExplorer,
  indexHeroesById,
  paginateExplorer,
  parseExplorerState,
  runExplorer,
  sortHeroesForExplorer,
  sortSkinsForExplorer,
  withFilterPatch,
  withView,
  type ExplorerState,
} from "./explorer-model.ts";

/**
 * Explorer model tests (task 05-04).
 *
 * The contract under test: URL parameters are parsed tolerantly into a typed
 * state, filters compose over published entries only, results are bounded, and
 * the whole derivation is deterministic (so the server render and the hydrated
 * client render agree).
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

const defaultState = (): ExplorerState => parseExplorerState({});

// ---------------------------------------------------------------------------
// Parameter parsing and serialisation
// ---------------------------------------------------------------------------

test("empty and missing parameters parse to the default state", () => {
  assert.deepEqual(parseExplorerState({}), defaultState());
  assert.deepEqual(parseExplorerState(undefined), defaultState());
  assert.deepEqual(parseExplorerState(null), defaultState());
  assert.equal(defaultState().view, "heroes");
  assert.equal(defaultState().page, 1);
  assert.equal(countActiveFilters(defaultState().filters), 0);
});

test("invalid parameter values fall back instead of throwing", () => {
  const state = parseExplorerState({
    view: "admin",
    q: "  ",
    role: "wizard",
    rarity: "mythic",
    series: "   ",
    owned: "maybe",
    fav: "true",
    page: "-4",
  });
  assert.deepEqual(state, defaultState());

  const junk = parseExplorerState({
    view: ["skins", "heroes"],
    page: "0000abc",
    q: ["first", "second"],
  });
  assert.equal(junk.view, "skins", "array parameters use their first value");
  assert.equal(junk.page, 1);
  assert.equal(junk.filters.query, "first");
});

test("every declared enum value round-trips through the URL", () => {
  for (const role of HERO_ROLES) {
    assert.equal(parseExplorerState({ role }).filters.role, role);
  }
  for (const rarity of SKIN_RARITIES) {
    assert.equal(parseExplorerState({ rarity }).filters.rarity, rarity);
  }
  for (const view of ["heroes", "skins"] as const) {
    assert.equal(parseExplorerState({ view }).view, view);
  }
});

test("valid parameters parse into a typed state", () => {
  const state = parseExplorerState({
    view: "skins",
    q: "  wind walker ",
    role: "marksman",
    rarity: "collector",
    series: "Starlight Chronicle",
    owned: "owned",
    fav: "favorites",
    page: "3",
  });
  assert.equal(state.view, "skins");
  assert.equal(state.filters.query, "wind walker");
  assert.equal(state.filters.role, "marksman");
  assert.equal(state.filters.rarity, "collector");
  assert.equal(state.filters.series, "Starlight Chronicle");
  assert.equal(state.filters.ownership, "owned");
  assert.equal(state.filters.favorites, "favorites");
  assert.equal(state.page, 3);
});

test("oversized query and series values are bounded, not rejected", () => {
  const state = parseExplorerState({
    q: "x".repeat(5_000),
    series: "y".repeat(5_000),
    page: "12345678",
  });
  assert.equal(Array.from(state.filters.query).length, 80);
  assert.equal(Array.from(state.filters.series).length, 120);
  assert.equal(state.page, 1, "a page beyond six digits is not trusted");
});

test("states serialise canonically and round-trip through the parser", () => {
  assert.deepEqual(explorerStateToParams(defaultState()), {});
  assert.equal(explorerStateToSearch(defaultState()), "");

  const state = parseExplorerState({
    view: "skins",
    q: "gold",
    rarity: "legend",
    owned: "unowned",
    page: "2",
  });
  const search = explorerStateToSearch(state);
  assert.deepEqual(parseExplorerState(new URLSearchParams(search)), state);
  assert.equal(explorerStateKey(state), search);
});

test("filter patches reset paging and view switches keep the filters", () => {
  const state = parseExplorerState({ q: "gold", page: "4" });

  const patched = withFilterPatch(state, { role: "mage" });
  assert.equal(patched.page, 1, "a new filter set starts at page one");
  assert.equal(patched.filters.role, "mage");
  assert.equal(patched.filters.query, "gold");

  const switched = withView(state, "skins");
  assert.equal(switched.view, "skins");
  assert.equal(switched.page, 1);
  assert.equal(switched.filters.query, "gold", "filters survive the switch");
  assert.equal(withView(switched, "skins"), switched, "same view is a no-op");

  const cleared = clearExplorerFilters(switched);
  assert.deepEqual(cleared.filters, {
    query: "",
    role: "all",
    rarity: "all",
    series: "all",
    ownership: "all",
    favorites: "all",
  });
  assert.equal(cleared.view, "skins", "clearing filters keeps the view");
});

// ---------------------------------------------------------------------------
// Facets
// ---------------------------------------------------------------------------

test("facets only offer values the published data contains, in enum order", () => {
  const heroes = [
    hero({ primaryRole: "mage", secondaryRole: "tank" }),
    hero({ primaryRole: "marksman" }),
  ];
  const skins = [
    skin({ rarity: "collector", series: "Omega" }),
    skin({ rarity: "basic", series: "  Omega  " }),
    skin({ rarity: "legend", series: null }),
    skin({ rarity: "epic", series: "Abyss" }),
    skin({ rarity: "epic", series: "Abyss" }),
    skin({ rarity: "basic", series: "   " }),
  ];

  const facets = buildExplorerFacets({ heroes, skins });
  assert.deepEqual(facets.roles, ["tank", "mage", "marksman"]);
  assert.deepEqual(facets.rarities, ["basic", "legend", "epic", "collector"]);
  assert.deepEqual(facets.series, ["Abyss", "Omega"]);
  assert.equal(facets.hasFavoriteHeroes, false);
  assert.equal(facets.hasFavoriteSkins, false);

  const withFavorites = buildExplorerFacets({
    heroes: [hero({ isFavorite: true })],
    skins: [skin({ isFavorite: true })],
  });
  assert.equal(withFavorites.hasFavoriteHeroes, true);
  assert.equal(withFavorites.hasFavoriteSkins, true);

  assert.deepEqual(buildExplorerFacets(null).roles, []);
  assert.deepEqual(buildExplorerFacets(null).series, []);
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

test("hero filtering composes query, role and favourites", () => {
  const mages = [
    hero({ name: "Yve", slug: "yve", primaryRole: "mage" }),
    hero({
      name: "Mathilda",
      primaryRole: "support",
      secondaryRole: "mage",
      specialty: "Reap / Poke",
    }),
    hero({ name: "Beatrix", primaryRole: "marksman", isFavorite: true }),
  ];

  assert.equal(filterHeroesForExplorer(mages, defaultState().filters).length, 3);
  assert.deepEqual(
    filterHeroesForExplorer(mages, {
      ...defaultState().filters,
      role: "mage",
    }).map((entry) => entry.name),
    ["Yve", "Mathilda"],
    "a secondary role counts"
  );
  assert.deepEqual(
    filterHeroesForExplorer(mages, {
      ...defaultState().filters,
      favorites: "favorites",
    }).map((entry) => entry.name),
    ["Beatrix"]
  );
  assert.deepEqual(
    filterHeroesForExplorer(mages, {
      ...defaultState().filters,
      query: "poke",
    }).map((entry) => entry.name),
    ["Mathilda"],
    "the haystack includes specialty text"
  );
  assert.deepEqual(
    filterHeroesForExplorer(mages, {
      ...defaultState().filters,
      query: "MARKSMAN",
    }).map((entry) => entry.name),
    ["Beatrix"],
    "matching is case-insensitive and covers role labels"
  );
  assert.deepEqual(
    filterHeroesForExplorer(mages, {
      ...defaultState().filters,
      query: "no such hero",
    }),
    []
  );
});

test("skin filtering composes rarity, series, ownership, role and favourites", () => {
  const heroes = [
    hero({ id: "h1", name: "Wanwan", primaryRole: "marksman" }),
    hero({ id: "h2", name: "Atlas", primaryRole: "tank" }),
  ];
  const heroesById = indexHeroesById(heroes);
  const skins = [
    skin({ name: "Rapid Boot", rarity: "basic", isOwned: false }),
    skin({
      name: "Megatron",
      heroId: "h1",
      rarity: "collector",
      series: "Transformers",
      isOwned: true,
      isFavorite: true,
    }),
    skin({
      name: "Deep Sea",
      heroId: "h2",
      rarity: "epic",
      series: "deep sea",
      isOwned: true,
    }),
    skin({ name: "Orphan", rarity: "legend" }),
  ];

  const filter = (overrides: Parameters<typeof withFilterPatch>[1]) =>
    filterSkinsForExplorer(
      skins,
      withFilterPatch(defaultState(), overrides).filters,
      heroesById
    );

  assert.equal(filter({}).length, 4);
  assert.deepEqual(
    filter({ rarity: "collector" }).map((entry) => entry.name),
    ["Megatron"]
  );
  assert.deepEqual(
    filter({ series: "DEEP SEA" }).map((entry) => entry.name),
    ["Deep Sea"],
    "series matching ignores case"
  );
  assert.deepEqual(
    filter({ ownership: "owned" }).map((entry) => entry.name),
    ["Megatron", "Deep Sea"]
  );
  assert.deepEqual(
    filter({ ownership: "unowned" }).map((entry) => entry.name),
    ["Rapid Boot", "Orphan"]
  );
  assert.deepEqual(
    filter({ role: "marksman" }).map((entry) => entry.name),
    ["Megatron"],
    "role resolves through the linked hero"
  );
  assert.equal(
    filter({ role: "marksman", ownership: "unowned" }).length,
    0,
    "independent predicates combine with AND"
  );
  assert.deepEqual(
    filter({ favorites: "favorites" }).map((entry) => entry.name),
    ["Megatron"]
  );
  assert.deepEqual(
    filter({ query: "wanwan" }).map((entry) => entry.name),
    ["Megatron"],
    "the haystack includes the linked hero name"
  );
});

test("the heroes view never applies skin-only filters", () => {
  const heroes = [hero({ name: "Gloo", primaryRole: "tank" })];
  // A state a visitor could reach by hand-editing the URL.
  const state = parseExplorerState({ rarity: "collector", owned: "owned" });
  assert.deepEqual(
    filterHeroesForExplorer(heroes, state.filters).map((entry) => entry.name),
    ["Gloo"]
  );
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

test("ordering is deterministic and never mutates the input", () => {
  const heroes = [
    hero({ name: "B", masteryLevel: 10, totalMatches: 500 }),
    hero({ name: "A", masteryLevel: 10, totalMatches: 500 }),
    hero({ name: "C", masteryLevel: 90 }),
  ];
  const heroOrderBefore = heroes.map((entry) => entry.name);
  assert.deepEqual(
    sortHeroesForExplorer(heroes).map((entry) => entry.name),
    ["C", "A", "B"],
    "mastery first, then matches, then code-unit name order"
  );
  assert.deepEqual(
    heroes.map((entry) => entry.name),
    heroOrderBefore,
    "sorting must not mutate the published arrays"
  );

  const skins = [
    skin({ name: "Mid", rarity: "epic", isOwned: true, acquisitionDate: "2020-01-01" }),
    skin({ name: "Top", rarity: "collector" }),
    skin({ name: "Low", rarity: "basic" }),
    skin({ name: "Old", rarity: "epic", isOwned: true, acquisitionDate: "2019-01-01" }),
    skin({ name: "Unowned", rarity: "epic", isOwned: false }),
  ];
  assert.deepEqual(
    sortSkinsForExplorer(skins).map((entry) => entry.name),
    ["Top", "Mid", "Old", "Unowned", "Low"],
    "rarity, then owned, then newest acquisition, then name"
  );
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

test("pagination bounds results and folds out-of-range pages in", () => {
  const items = Array.from({ length: 50 }, (_, index) => index);

  const first = paginateExplorer(items, 1, 24);
  assert.equal(first.page, 1);
  assert.equal(first.pageCount, 3);
  assert.deepEqual(first.range, { from: 1, to: 24 });
  assert.equal(first.hasPrev, false);
  assert.equal(first.hasNext, true);

  const last = paginateExplorer(items, 3, 24);
  assert.deepEqual(last.range, { from: 49, to: 50 });
  assert.equal(last.hasPrev, true);
  assert.equal(last.hasNext, false);

  assert.equal(paginateExplorer(items, 99, 24).page, 3, "clamped above");
  assert.equal(paginateExplorer(items, -5, 24).page, 1, "clamped below");
  assert.equal(paginateExplorer(items, Number.NaN, 24).page, 1);

  const empty = paginateExplorer([], 7, 24);
  assert.equal(empty.page, 1);
  assert.equal(empty.pageCount, 1);
  assert.equal(empty.range, null);
  assert.deepEqual(empty.items, []);
  assert.equal(EXPLORER_PAGE_SIZE, 24);
});

// ---------------------------------------------------------------------------
// Full run
// ---------------------------------------------------------------------------

test("runExplorer derives one consistent result set per state", () => {
  const heroes = Array.from({ length: 30 }, (_, index) =>
    hero({ name: `Hero ${String(index).padStart(2, "0")}`, masteryLevel: index })
  );
  const skins = [
    skin({ name: "Owned Epic", rarity: "epic", isOwned: true }),
    skin({ name: "Basic", rarity: "basic" }),
  ];
  const collection = { heroes, skins };

  const heroRun = runExplorer(collection, parseExplorerState({ page: "2" }));
  assert.equal(heroRun.matchingCount, 30);
  assert.equal(heroRun.page, 2);
  assert.equal(heroRun.pageCount, 2);
  assert.equal(heroRun.heroes.length, 6, "page two holds the remaining items");
  assert.deepEqual(heroRun.skins, []);
  assert.deepEqual(heroRun.range, { from: 25, to: 30 });
  assert.equal(heroRun.published.heroes, 30);

  const skinRun = runExplorer(
    collection,
    parseExplorerState({ view: "skins", owned: "owned" })
  );
  assert.equal(skinRun.matchingCount, 1);
  assert.deepEqual(
    skinRun.skins.map((entry) => entry.name),
    ["Owned Epic"]
  );
  assert.deepEqual(skinRun.heroes, []);
  assert.equal(skinRun.facets.rarities.length, 2);

  // A stale page number must not blank the grid after filtering.
  const clamped = runExplorer(
    collection,
    parseExplorerState({ view: "skins", page: "12" })
  );
  assert.equal(clamped.page, 1);
  assert.equal(clamped.matchingCount, 2);

  const emptyRun = runExplorer(null, defaultState());
  assert.equal(emptyRun.matchingCount, 0);
  assert.equal(emptyRun.range, null);
  assert.deepEqual(emptyRun.facets.roles, []);
});

test("identical inputs always produce identical results", () => {
  const collection = {
    heroes: [hero({ name: "Alpha", primaryRole: "fighter" })],
    skins: [skin({ name: "Street Blow", rarity: "special", series: "Streets" })],
  };
  const state = parseExplorerState({ view: "skins", q: "streets" });

  const first = JSON.stringify(runExplorer(collection, state));
  const second = JSON.stringify(runExplorer(collection, state));
  assert.equal(first, second, "server and client renders must agree");
});
