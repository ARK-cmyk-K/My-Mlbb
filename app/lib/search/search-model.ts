/**
 * Global search model (task `06-01`).
 *
 * Pure rules for the Cmd/Ctrl+K search: how a query is normalised, how the
 * published-search RPC payload is turned into a bounded, typed result set,
 * and how a result is linked.
 *
 * Everything here is pure (no I/O, no React, no browser APIs) so the same
 * input always produces the same output on the server, in the browser and in
 * the unit tests.
 */

/** The result categories, in display order. */
export const SEARCH_CATEGORIES = [
  { id: "heroes", label: "Heroes", rpcKey: "heroes" },
  { id: "skins", label: "Skins", rpcKey: "skins" },
  { id: "achievements", label: "Achievements", rpcKey: "achievements" },
  { id: "timeline", label: "Timeline", rpcKey: "timeline_entries" },
] as const;

export type SearchCategoryId = (typeof SEARCH_CATEGORIES)[number]["id"];

/** One search hit. */
export interface SearchResultItem {
  /** Stable id of the published row. */
  id: string;
  /** Display title (the hero/skin name, the achievement title, …). */
  title: string;
  /** Secondary label (role, rarity, category, kind). */
  subtitle: string | null;
}

/** The categorized result set, one list per category. */
export type CategorizedSearchResults = Record<
  SearchCategoryId,
  SearchResultItem[]
>;

/** A result with the category it belongs to — used for keyboard navigation. */
export interface FlatSearchResult extends SearchResultItem {
  category: SearchCategoryId;
  /** Index of the option in the flattened list. */
  index: number;
  /** DOM id of the option element. */
  domId: string;
}

/** Minimum query length the search accepts (the RPC ignores anything shorter). */
export const SEARCH_QUERY_MIN_LENGTH = 2;

/** Maximum query length accepted from the browser. */
export const SEARCH_QUERY_MAX_LENGTH = 80;

/** Maximum number of results shown per category. */
export const SEARCH_RESULT_LIMIT = 8;

/** Maximum number of results shown in total. */
export const SEARCH_MAX_TOTAL = SEARCH_RESULT_LIMIT * 4;

/** Maximum length of a title or subtitle kept from the payload. */
const SEARCH_TEXT_MAX_LENGTH = 120;

/** An empty, frozen result set. */
export const EMPTY_SEARCH_RESULTS: CategorizedSearchResults = Object.freeze({
  heroes: Object.freeze([]) as unknown as SearchResultItem[],
  skins: Object.freeze([]) as unknown as SearchResultItem[],
  achievements: Object.freeze([]) as unknown as SearchResultItem[],
  timeline: Object.freeze([]) as unknown as SearchResultItem[],
}) as CategorizedSearchResults;

/**
 * Normalises a raw query.
 *
 * Trims, collapses internal whitespace, bounds the length and strips control
 * characters. The result is safe to hand to the RPC and to put in a URL.
 */
export function normalizeSearchQuery(raw: string | null | undefined): string {
  if (typeof raw !== "string") {
    return "";
  }
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned.slice(0, SEARCH_QUERY_MAX_LENGTH);
}

/** True when the query is long enough to be worth searching for. */
export function isSearchableQuery(query: string): boolean {
  return normalizeSearchQuery(query).length >= SEARCH_QUERY_MIN_LENGTH;
}

/** Trims and bounds one display string from the payload. */
function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed.slice(0, SEARCH_TEXT_MAX_LENGTH);
}

/** Reads one result item; returns `null` for anything unusable. */
function readItem(value: unknown): SearchResultItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as { id?: unknown; title?: unknown; subtitle?: unknown };
  const id = readText(candidate.id);
  const title = readText(candidate.title);
  if (id === null || title === null) {
    return null;
  }
  return { id, title, subtitle: readText(candidate.subtitle) };
}

/** Reads one category list; never throws. */
function readCategory(value: unknown, limit: number): SearchResultItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: SearchResultItem[] = [];
  for (const candidate of value) {
    if (items.length >= limit) {
      break;
    }
    const item = readItem(candidate);
    if (item !== null) {
      items.push(item);
    }
  }
  return items;
}

/**
 * Parses the payload returned by `search_published_content`.
 *
 * The RPC returns a `jsonb` object with one array per category. The payload is
 * treated as untrusted input: a missing key, a wrong type or a malformed item
 * yields an empty list for that category rather than an exception, and every
 * list is bounded.
 */
export function parseSearchPayload(payload: unknown): CategorizedSearchResults {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      heroes: [],
      skins: [],
      achievements: [],
      timeline: [],
    };
  }
  const record = payload as Record<string, unknown>;
  const results: CategorizedSearchResults = {
    heroes: [],
    skins: [],
    achievements: [],
    timeline: [],
  };
  for (const category of SEARCH_CATEGORIES) {
    results[category.id] = readCategory(
      record[category.rpcKey],
      SEARCH_RESULT_LIMIT
    );
  }
  return results;
}

/** Total number of results across every category. */
export function countSearchResults(results: CategorizedSearchResults): number {
  return SEARCH_CATEGORIES.reduce(
    (total, category) => total + results[category.id].length,
    0
  );
}

/**
 * Flattens the categorized results into the order the keyboard navigates.
 *
 * The order is the category order, so the list reads top to bottom exactly as
 * it is rendered. `domId` is derived from the category and the item id, so it
 * is stable across renders and safe to use in `aria-activedescendant`.
 */
export function flattenSearchResults(
  results: CategorizedSearchResults,
  idPrefix = "global-search"
): FlatSearchResult[] {
  const flat: FlatSearchResult[] = [];
  for (const category of SEARCH_CATEGORIES) {
    for (const item of results[category.id]) {
      if (flat.length >= SEARCH_MAX_TOTAL) {
        return flat;
      }
      flat.push({
        ...item,
        category: category.id,
        index: flat.length,
        domId: `${idPrefix}-option-${category.id}-${item.id}`,
      });
    }
  }
  return flat;
}

/**
 * The public link for a search result.
 *
 * Heroes and skins deep-link into the collection explorer, filtered to the
 * matching entry, so the result is the *first* thing the visitor sees.
 * Achievements and timeline entries have no dedicated public page — they are
 * shown on the homepage showcase — so they link there.
 */
export function buildSearchResultHref(
  category: SearchCategoryId,
  item: SearchResultItem
): string {
  if (category === "heroes" || category === "skins") {
    const params = new URLSearchParams();
    params.set("view", category);
    params.set("q", item.title);
    return `/collection?${params.toString()}`;
  }
  return "/";
}

/** Human label for a category. */
export function searchCategoryLabel(category: SearchCategoryId): string {
  return (
    SEARCH_CATEGORIES.find((entry) => entry.id === category)?.label ?? "Results"
  );
}
