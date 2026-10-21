import type { PublishedHero, PublishedSkin } from "../content/contracts.ts";
import {
  HERO_ROLES,
  SKIN_RARITIES,
  type HeroRole,
  type SkinRarity,
} from "../content/validation.ts";
import { formatEnumLabel } from "../showcase/showcase-model.ts";

/**
 * Typed, composable filtering for the public collection explorer (task 05-04).
 *
 * Scope and guarantees:
 *
 * - **Published data only.** Every function here operates on the
 *   {@link ExplorerCollection} handed to it, which the server component builds
 *   exclusively from `getPublishedRelease()` (the `published_*` projection).
 *   The model never queries anything, so a draft row cannot leak through a
 *   filter.
 * - **Pure.** No I/O, no React, no locale-dependent behaviour (`toLowerCase`,
 *   code-unit comparison and `URLSearchParams` are locale-stable), so the same
 *   state produces byte-identical results during the server render, the client
 *   hydration, and the unit tests.
 * - **Tolerant parsing, never throwing.** URL parameters are attacker-controlled
 *   input: unknown views, out-of-enum filters, arrays and garbage pages all
 *   degrade to the documented default instead of raising.
 * - **Filters compose.** Each predicate is independent and combined with `&&`,
 *   and a filter that a view cannot support (e.g. rarity in the heroes view) is
 *   simply not applied there — it is never silently reinterpreted.
 */

/** The two explorer views; also the order they appear in the switcher. */
export const EXPLORER_VIEWS = ["heroes", "skins"] as const;
export type ExplorerView = (typeof EXPLORER_VIEWS)[number];

/** Items per page. Bounds the rendered grid for any collection size. */
export const EXPLORER_PAGE_SIZE = 24;

/**
 * Input bounds. Long values are truncated, never rejected, so a hostile or
 * accidental `?q=` of megabytes can neither break the URL nor blow up a render.
 */
export const EXPLORER_QUERY_MAX_LENGTH = 80;
export const EXPLORER_SERIES_MAX_LENGTH = 120;

/**
 * Filter option lists. Each list starts with the `"all"` sentinel, which is
 * what {@link coerceExplorerOption} and the parser fall back to, so the typed
 * filter union, the URL parser, and the `<option>` lists the UI renders all
 * come from one definition and cannot drift apart.
 */
export const EXPLORER_ROLE_OPTIONS = ["all", ...HERO_ROLES] as const;
export const EXPLORER_RARITY_OPTIONS = ["all", ...SKIN_RARITIES] as const;
export const EXPLORER_OWNERSHIP_OPTIONS = ["all", "owned", "unowned"] as const;
export const EXPLORER_FAVORITES_OPTIONS = ["all", "favorites"] as const;

export type ExplorerRoleFilter = (typeof EXPLORER_ROLE_OPTIONS)[number];
export type ExplorerRarityFilter = (typeof EXPLORER_RARITY_OPTIONS)[number];
export type ExplorerOwnershipFilter =
  (typeof EXPLORER_OWNERSHIP_OPTIONS)[number];
export type ExplorerFavoritesFilter =
  (typeof EXPLORER_FAVORITES_OPTIONS)[number];

/**
 * Narrows a raw string (a `<select>` value, a URL parameter) to one of the
 * allowed options, else the list's first entry (`"all"`).
 */
export function coerceExplorerOption<T extends string>(
  value: string,
  allowed: readonly T[]
): T {
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : allowed[0];
}

/** The full filter set for one explorer state. */
export interface ExplorerFilters {
  /** Free text matched against names, slugs, series and other labels. */
  query: string;
  /** Hero role (both views: skins match through their linked hero). */
  role: ExplorerRoleFilter;
  /** Skin rarity (skins view only; ignored while viewing heroes). */
  rarity: ExplorerRarityFilter;
  /** Skin series, exact but case-insensitive (skins view only). */
  series: string;
  /** Ownership (skins view only — published heroes carry no ownership flag). */
  ownership: ExplorerOwnershipFilter;
  /** Limit to entries flagged as a favourite by the account owner. */
  favorites: ExplorerFavoritesFilter;
}

/** Everything the URL can express: view, filters, and the result page. */
export interface ExplorerState {
  view: ExplorerView;
  filters: ExplorerFilters;
  /** 1-based; clamped into range when results are paginated. */
  page: number;
}

export const DEFAULT_EXPLORER_FILTERS: Readonly<ExplorerFilters> =
  Object.freeze({
    query: "",
    role: "all",
    rarity: "all",
    series: "all",
    ownership: "all",
    favorites: "all",
  });

export const DEFAULT_EXPLORER_STATE: Readonly<ExplorerState> = Object.freeze({
  view: "heroes",
  filters: DEFAULT_EXPLORER_FILTERS,
  page: 1,
});

/**
 * URL search-parameter keys. Short but stable, and documented here so the
 * server parser and any shared link agree.
 */
export const EXPLORER_PARAM_KEYS = {
  view: "view",
  query: "q",
  role: "role",
  rarity: "rarity",
  series: "series",
  ownership: "owned",
  favorites: "fav",
  page: "page",
} as const;

/** The raw shape Next.js hands to a page as `searchParams`. */
export type ExplorerParams = Record<string, string | string[] | undefined>;

/** Anything `parseExplorerState` can read: Next's record or `location.search`. */
export type ExplorerParamSource = ExplorerParams | URLSearchParams;

/** Reads one raw parameter from either accepted source shape. */
function readParam(
  source: ExplorerParamSource,
  key: string
): string | string[] | undefined {
  return source instanceof URLSearchParams
    ? source.get(key) ?? undefined
    : source[key];
}

// ---------------------------------------------------------------------------
// Parsing and serialisation
// ---------------------------------------------------------------------------

/**
 * Builds an explorer state from raw URL parameters.
 *
 * Invalid input never throws: every field independently falls back to its
 * default, so a hand-mangled URL still renders a working explorer (and the
 * canonical re-serialisation of that state is a clean URL).
 */
export function parseExplorerState(
  params: ExplorerParamSource | null | undefined
): ExplorerState {
  const source = params ?? {};
  const read = (key: string) => readParam(source, key);
  return {
    view: readEnum(read(EXPLORER_PARAM_KEYS.view), EXPLORER_VIEWS) ??
      DEFAULT_EXPLORER_STATE.view,
    filters: {
      query: readText(
        read(EXPLORER_PARAM_KEYS.query),
        EXPLORER_QUERY_MAX_LENGTH
      ),
      role:
        readEnum(read(EXPLORER_PARAM_KEYS.role), EXPLORER_ROLE_OPTIONS) ??
        "all",
      rarity:
        readEnum(read(EXPLORER_PARAM_KEYS.rarity), EXPLORER_RARITY_OPTIONS) ??
        "all",
      series: readText(
        read(EXPLORER_PARAM_KEYS.series),
        EXPLORER_SERIES_MAX_LENGTH
      ),
      ownership:
        readEnum(
          read(EXPLORER_PARAM_KEYS.ownership),
          EXPLORER_OWNERSHIP_OPTIONS
        ) ?? "all",
      favorites:
        readEnum(
          read(EXPLORER_PARAM_KEYS.favorites),
          EXPLORER_FAVORITES_OPTIONS
        ) ?? "all",
    },
    page: readPage(read(EXPLORER_PARAM_KEYS.page)),
  };
}

/**
 * Serialises a state back to URL parameters, omitting every default so the
 * canonical URL for an untouched explorer is simply `/collection`.
 */
export function explorerStateToParams(
  state: ExplorerState
): Record<string, string> {
  const params: Record<string, string> = {};
  const filters = state.filters;

  if (state.view !== DEFAULT_EXPLORER_STATE.view) {
    params[EXPLORER_PARAM_KEYS.view] = state.view;
  }
  if (filters.query !== DEFAULT_EXPLORER_FILTERS.query) {
    params[EXPLORER_PARAM_KEYS.query] = filters.query;
  }
  if (filters.role !== DEFAULT_EXPLORER_FILTERS.role) {
    params[EXPLORER_PARAM_KEYS.role] = filters.role;
  }
  if (filters.rarity !== DEFAULT_EXPLORER_FILTERS.rarity) {
    params[EXPLORER_PARAM_KEYS.rarity] = filters.rarity;
  }
  if (filters.series !== DEFAULT_EXPLORER_FILTERS.series) {
    params[EXPLORER_PARAM_KEYS.series] = filters.series;
  }
  if (filters.ownership !== DEFAULT_EXPLORER_FILTERS.ownership) {
    params[EXPLORER_PARAM_KEYS.ownership] = filters.ownership;
  }
  if (filters.favorites !== DEFAULT_EXPLORER_FILTERS.favorites) {
    params[EXPLORER_PARAM_KEYS.favorites] = filters.favorites;
  }
  if (state.page !== DEFAULT_EXPLORER_STATE.page) {
    params[EXPLORER_PARAM_KEYS.page] = String(state.page);
  }
  return params;
}

/** `?…` search string for a state; `""` for the default state. */
export function explorerStateToSearch(state: ExplorerState): string {
  const search = new URLSearchParams(explorerStateToParams(state)).toString();
  return search === "" ? "" : `?${search}`;
}

/**
 * Canonical string form of a state, used to detect "the URL the server handed
 * down differs from the state the visitor has built up client-side".
 */
export function explorerStateKey(state: ExplorerState): string {
  return explorerStateToSearch(state);
}

/** Replaces the filter set and resets to the first page (filters change the result count). */
export function withFilterPatch(
  state: ExplorerState,
  patch: Partial<ExplorerFilters>
): ExplorerState {
  return {
    view: state.view,
    filters: { ...state.filters, ...patch },
    page: DEFAULT_EXPLORER_STATE.page,
  };
}

/**
 * Switches view and resets paging, keeping every filter.
 *
 * Skin-only filters (rarity/series/ownership) are deliberately kept while the
 * heroes view is shown: switching back restores the visitor's exact skin query,
 * and in the heroes view they are inert rather than reinterpreted. The active
 * filter chips make them visible instead of mysterious.
 */
export function withView(state: ExplorerState, view: ExplorerView): ExplorerState {
  if (state.view === view) {
    return state;
  }
  return { view, filters: state.filters, page: DEFAULT_EXPLORER_STATE.page };
}

/** Moves to a result page (clamped later, when the page is applied). */
export function withPage(state: ExplorerState, page: number): ExplorerState {
  return { ...state, page };
}

/** Clears every filter but keeps the current view and returns to page 1. */
export function clearExplorerFilters(state: ExplorerState): ExplorerState {
  return {
    view: state.view,
    filters: { ...DEFAULT_EXPLORER_FILTERS },
    page: DEFAULT_EXPLORER_STATE.page,
  };
}

/** How many filters differ from the defaults (drives the "clear" affordance). */
export function countActiveFilters(filters: ExplorerFilters): number {
  let count = 0;
  if (filters.query !== DEFAULT_EXPLORER_FILTERS.query) count += 1;
  if (filters.role !== DEFAULT_EXPLORER_FILTERS.role) count += 1;
  if (filters.rarity !== DEFAULT_EXPLORER_FILTERS.rarity) count += 1;
  if (filters.series !== DEFAULT_EXPLORER_FILTERS.series) count += 1;
  if (filters.ownership !== DEFAULT_EXPLORER_FILTERS.ownership) count += 1;
  if (filters.favorites !== DEFAULT_EXPLORER_FILTERS.favorites) count += 1;
  return count;
}

// ---------------------------------------------------------------------------
// Facets (which filter options the published data can actually offer)
// ---------------------------------------------------------------------------

/**
 * Filter options derived from the published collection.
 *
 * Only values that actually occur are offered, in the canonical enum order
 * (roles/rarities) or alphabetical order (series). Offering an option with no
 * results behind it would be a trap, and deriving them from data keeps the
 * controls honest when a release publishes only part of the collection.
 */
export interface ExplorerFacets {
  roles: readonly HeroRole[];
  rarities: readonly SkinRarity[];
  series: readonly string[];
  /** At least one published hero is flagged as a favourite. */
  hasFavoriteHeroes: boolean;
  /** At least one published skin is flagged as a favourite. */
  hasFavoriteSkins: boolean;
}

/** The published slices the explorer reads. */
export interface ExplorerCollection {
  heroes: readonly PublishedHero[];
  skins: readonly PublishedSkin[];
}

export function buildExplorerFacets(
  collection: ExplorerCollection | null | undefined
): ExplorerFacets {
  const heroes = collection?.heroes ?? [];
  const skins = collection?.skins ?? [];

  const presentRoles = new Set<HeroRole>();
  for (const hero of heroes) {
    presentRoles.add(hero.primaryRole);
    if (hero.secondaryRole !== null) {
      presentRoles.add(hero.secondaryRole);
    }
  }

  const presentRarities = new Set<SkinRarity>();
  const presentSeries = new Set<string>();
  let hasFavoriteSkins = false;
  for (const skin of skins) {
    presentRarities.add(skin.rarity);
    const series = skin.series?.trim();
    if (series !== undefined && series !== "") {
      presentSeries.add(series);
    }
    if (skin.isFavorite) {
      hasFavoriteSkins = true;
    }
  }

  let hasFavoriteHeroes = false;
  for (const hero of heroes) {
    if (hero.isFavorite) {
      hasFavoriteHeroes = true;
      break;
    }
  }

  return {
    // Filtered against the canonical lists, so facets are always in enum order.
    roles: HERO_ROLES.filter((role) => presentRoles.has(role)),
    rarities: SKIN_RARITIES.filter((rarity) => presentRarities.has(rarity)),
    series: [...presentSeries].sort(compareCodeUnits),
    hasFavoriteHeroes,
    hasFavoriteSkins,
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Locale-stable lowercase/whitespace normalisation used for text matching. */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Case- and whitespace-insensitive text equality (used for series matching,
 * where the URL may not byte-match the stored value).
 */
export function sameSearchText(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  return normalizeSearchText(a) === normalizeSearchText(b);
}

function matchesQuery(
  haystack: ReadonlyArray<string | null | undefined>,
  query: string
): boolean {
  const needle = normalizeSearchText(query);
  if (needle === "") {
    return true;
  }
  return haystack.some(
    (entry) =>
      entry !== null &&
      entry !== undefined &&
      normalizeSearchText(entry).includes(needle)
  );
}

/**
 * Applies the filters a heroes view supports: query, role and favourites.
 *
 * Rarity, series and ownership are deliberately not applied — published heroes
 * carry none of those fields, and inventing a rule for them (e.g. "hero owns a
 * skin of that rarity") would produce results the filter labels cannot explain.
 */
export function filterHeroesForExplorer(
  heroes: readonly PublishedHero[],
  filters: ExplorerFilters
): PublishedHero[] {
  return heroes.filter((hero) => {
    if (filters.favorites === "favorites" && !hero.isFavorite) {
      return false;
    }
    if (
      filters.role !== "all" &&
      hero.primaryRole !== filters.role &&
      hero.secondaryRole !== filters.role
    ) {
      return false;
    }
    return matchesQuery(
      [
        hero.name,
        hero.slug,
        hero.specialty,
        formatEnumLabel(hero.primaryRole),
        hero.secondaryRole === null ? null : formatEnumLabel(hero.secondaryRole),
      ],
      filters.query
    );
  });
}

/** Index for resolving a skin's linked hero (name and role) without a join. */
export function indexHeroesById(
  heroes: readonly PublishedHero[]
): Map<string, PublishedHero> {
  return new Map(heroes.map((hero) => [hero.id, hero]));
}

/**
 * Applies every filter the data supports for skins: query, role (through the
 * linked hero), rarity, series, ownership and favourites.
 *
 * A skin with no linked hero cannot answer a role filter, so it is excluded
 * while a role filter is active rather than being guessed into the results.
 */
export function filterSkinsForExplorer(
  skins: readonly PublishedSkin[],
  filters: ExplorerFilters,
  heroesById: ReadonlyMap<string, PublishedHero>
): PublishedSkin[] {
  return skins.filter((skin) => {
    if (filters.favorites === "favorites" && !skin.isFavorite) {
      return false;
    }
    if (filters.ownership === "owned" && !skin.isOwned) {
      return false;
    }
    if (filters.ownership === "unowned" && skin.isOwned) {
      return false;
    }
    if (filters.rarity !== "all" && skin.rarity !== filters.rarity) {
      return false;
    }
    if (filters.series !== "all" && !sameSearchText(skin.series, filters.series)) {
      return false;
    }
    const hero =
      skin.heroId === null ? undefined : heroesById.get(skin.heroId);
    if (
      filters.role !== "all" &&
      (hero === undefined ||
        (hero.primaryRole !== filters.role &&
          hero.secondaryRole !== filters.role))
    ) {
      return false;
    }
    return matchesQuery(
      [
        skin.name,
        skin.slug,
        skin.series,
        skin.acquisitionMilestone,
        hero === undefined ? null : hero.name,
      ],
      filters.query
    );
  });
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Best-mastery heroes first (mastery, then matches, then name). Returns a new
 * array; the published release's own order is never mutated.
 */
export function sortHeroesForExplorer(
  heroes: readonly PublishedHero[]
): PublishedHero[] {
  return [...heroes].sort(
    (a, b) =>
      b.masteryLevel - a.masteryLevel ||
      b.totalMatches - a.totalMatches ||
      compareCodeUnits(a.name, b.name)
  );
}

/**
 * Highest rarity first (canonical rarity order, so Collector leads), owned
 * before unowned, newest acquisition first, then name. Missing acquisition
 * dates sort last instead of pretending to be old.
 */
export function sortSkinsForExplorer(
  skins: readonly PublishedSkin[]
): PublishedSkin[] {
  return [...skins].sort(
    (a, b) =>
      SKIN_RARITIES.indexOf(b.rarity) - SKIN_RARITIES.indexOf(a.rarity) ||
      Number(b.isOwned) - Number(a.isOwned) ||
      compareDateDesc(a.acquisitionDate, b.acquisitionDate) ||
      compareCodeUnits(a.name, b.name)
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** The bounded slice of results actually rendered, plus its page context. */
export interface ExplorerPageSlice<T> {
  items: T[];
  /** The clamped page that was actually shown. */
  page: number;
  /** Always at least 1, so "Page 1 of 1" reads sensibly when empty. */
  pageCount: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** 1-based inclusive range of visible items; `null` when there are none. */
  range: { from: number; to: number } | null;
}

/**
 * Slices a result list into a page, clamping the requested page into
 * `[1, pageCount]`. An out-of-range page (e.g. after a filter shrank the
 * results) shows the nearest valid page rather than an empty grid.
 */
export function paginateExplorer<T>(
  items: readonly T[],
  page: number,
  pageSize: number = EXPLORER_PAGE_SIZE
): ExplorerPageSlice<T> {
  const size =
    Number.isFinite(pageSize) && pageSize >= 1
      ? Math.floor(pageSize)
      : EXPLORER_PAGE_SIZE;
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const requested = Number.isFinite(page) ? Math.floor(page) : 1;
  const current = Math.min(Math.max(requested, 1), pageCount);
  const start = (current - 1) * size;
  const visible = items.slice(start, start + size);

  return {
    items: [...visible],
    page: current,
    pageCount,
    total,
    hasPrev: current > 1,
    hasNext: current < pageCount,
    range:
      total === 0 ? null : { from: start + 1, to: start + visible.length },
  };
}

// ---------------------------------------------------------------------------
// One call the explorer UI renders from
// ---------------------------------------------------------------------------

/** Everything the explorer renders for one state, in one pass. */
export interface ExplorerRun {
  facets: ExplorerFacets;
  /** Published counts before filtering, for context in the status line. */
  published: { heroes: number; skins: number };
  /** Result count after filtering. */
  matchingCount: number;
  /** Page slice for the active view; the other view's array stays empty. */
  heroes: PublishedHero[];
  skins: PublishedSkin[];
  /** The clamped page that was actually shown (out-of-range pages are folded in). */
  page: number;
  /** Always at least 1. */
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** 1-based inclusive range of visible items; `null` when there are none. */
  range: { from: number; to: number } | null;
}

/**
 * Derives the complete explorer result for a state: facets, filtered + sorted
 * matches, and the bounded page slice.
 *
 * The server render and the client re-renders both call this with the same
 * inputs, so the HTML a visitor first downloads always matches what the
 * hydrated controls display.
 */
export function runExplorer(
  collection: ExplorerCollection | null | undefined,
  state: ExplorerState
): ExplorerRun {
  const heroes = collection?.heroes ?? [];
  const skins = collection?.skins ?? [];
  const facets = buildExplorerFacets({ heroes, skins });
  const base = {
    facets,
    published: { heroes: heroes.length, skins: skins.length },
  };

  if (state.view === "heroes") {
    const matching = sortHeroesForExplorer(
      filterHeroesForExplorer(heroes, state.filters)
    );
    const slice = paginateExplorer(matching, state.page);
    return {
      ...base,
      matchingCount: slice.total,
      heroes: slice.items,
      skins: [],
      page: slice.page,
      pageCount: slice.pageCount,
      hasPrev: slice.hasPrev,
      hasNext: slice.hasNext,
      range: slice.range,
    };
  }

  const matching = sortSkinsForExplorer(
    filterSkinsForExplorer(skins, state.filters, indexHeroesById(heroes))
  );
  const slice = paginateExplorer(matching, state.page);
  return {
    ...base,
    matchingCount: slice.total,
    heroes: [],
    skins: slice.items,
    page: slice.page,
    pageCount: slice.pageCount,
    hasPrev: slice.hasPrev,
    hasNext: slice.hasNext,
    range: slice.range,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return typeof value === "string" ? value : "";
}

function readEnum<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[]
): T | null {
  const raw = firstParam(value);
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

function readText(
  value: string | string[] | undefined,
  maxLength: number
): string {
  const trimmed = firstParam(value).trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  // Slice by code point so a surrogate pair is never cut in half.
  return Array.from(trimmed).slice(0, maxLength).join("");
}

function readPage(value: string | string[] | undefined): number {
  const raw = firstParam(value).trim();
  if (!/^[0-9]{1,6}$/.test(raw)) {
    return DEFAULT_EXPLORER_STATE.page;
  }
  const page = Number.parseInt(raw, 10);
  return Number.isInteger(page) && page >= 1
    ? page
    : DEFAULT_EXPLORER_STATE.page;
}

/** Locale-stable string comparison (code-unit order, identical on server/client). */
function compareCodeUnits(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Newest first; missing dates sort last. */
function compareDateDesc(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  if (a === b) {
    return 0;
  }
  if (a === null || a === undefined) {
    return 1;
  }
  if (b === null || b === undefined) {
    return -1;
  }
  return b < a ? -1 : b > a ? 1 : 0;
}
