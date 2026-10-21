/**
 * Visitor favourites (task `05-06`) — pure model.
 *
 * A visitor can mark a published hero or skin as "one of mine". The list lives
 * **in the visitor's own browser** (`localStorage`); there is no visitor
 * account, no server-side list and no public like counter, so nothing about a
 * visitor's choice is ever transmitted, stored or shared.
 *
 * Rules this module owns (all pure, all unit-tested):
 *
 * - **Versioned storage.** The key embeds the schema version
 *   (`mlbb-showcase.favorites.v1`), and the payload carries the version too.
 *   A future format change writes a new key instead of trying to migrate data
 *   it does not understand.
 * - **Tolerant parsing.** `localStorage` is attacker-writable (any script on
 *   the origin, the user, or an old build may have written it), so parsing never
 *   throws: malformed JSON, a wrong version, a wrong shape and individual
 *   broken entries are all discarded, and the valid remainder is kept.
 * - **Bounded size.** The list is capped, so a hostile or buggy writer cannot
 *   make the page parse an unbounded array.
 * - **Deterministic output.** Entries keep insertion order and are de-duplicated
 *   by `kind:id`, so the server render, the hydrated client and the unit tests
 *   always agree.
 *
 * The module never touches `window` or `localStorage` — see
 * `app/lib/favorites/favorites-storage.ts` for the guarded browser adapter.
 */

/** The `localStorage` key the visitor's favourites are written to. */
export const FAVORITES_STORAGE_KEY = "mlbb-showcase.favorites.v1";

/** Schema version of the stored payload. */
export const FAVORITES_STORAGE_VERSION = 1;

/**
 * Upper bound on the number of favourites kept in storage.
 *
 * A collection is small; the cap only exists so a malformed or hostile writer
 * cannot turn the favourites list into an unbounded payload.
 */
export const MAX_VISITOR_FAVORITES = 200;

/** Which kind of published entry a favourite points at. */
export type FavoriteKind = "hero" | "skin";

/**
 * Name of the DOM event broadcast when the favourites change.
 *
 * The list lives in `localStorage`, which has no change event of its own, so
 * the components that display it (the per-card toggle, the favourites panel)
 * agree on this event to stay in sync.
 */
export const FAVORITES_CHANGED_EVENT = "mlbb-showcase:favorites-changed";

const FAVORITE_KINDS: readonly FavoriteKind[] = ["hero", "skin"];

/** A pointer to one published entry. */
export interface FavoriteRef {
  kind: FavoriteKind;
  id: string;
}

/**
 * The public identity of an entry, used by the favourite and share controls.
 *
 * The slug is what the canonical public URL is built from, so a shared link
 * keeps working after the display name changes.
 */
export interface FavoriteTarget {
  kind: FavoriteKind;
  id: string;
  name: string;
  slug: string;
}

/** Stable key for a favourite (`"hero:abc"`). */
export function favoriteKey(ref: FavoriteRef): string {
  return `${ref.kind}:${ref.id}`;
}

/**
 * Validates one stored entry.
 *
 * Returns `null` for anything that is not `{ kind, id }` with a known kind and
 * a non-empty string id — the caller drops it instead of failing the whole
 * list.
 */
export function parseFavoriteRef(value: unknown): FavoriteRef | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as { kind?: unknown; id?: unknown };
  const kind = candidate.kind;
  const id = candidate.id;

  if (typeof kind !== "string" || !FAVORITE_KINDS.includes(kind as FavoriteKind)) {
    return null;
  }
  if (typeof id !== "string") {
    return null;
  }
  const trimmedId = id.trim();
  if (trimmedId === "" || trimmedId.length > 128) {
    return null;
  }
  return { kind: kind as FavoriteKind, id: trimmedId };
}

/**
 * Parses the stored payload.
 *
 * Never throws. Returns an empty list for anything unusable, and keeps the
 * valid entries of a partially broken payload (a single bad entry should not
 * cost the visitor their other favourites).
 */
export function parseVisitorFavorites(
  raw: string | null | undefined
): FavoriteRef[] {
  if (typeof raw !== "string" || raw.trim() === "") {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [];
  }

  const payload = parsed as { version?: unknown; entries?: unknown };

  // A payload written by a different schema version is ignored entirely; the
  // versioned key means we would normally never even see it.
  if (payload.version !== FAVORITES_STORAGE_VERSION) {
    return [];
  }
  if (!Array.isArray(payload.entries)) {
    return [];
  }

  const seen = new Set<string>();
  const entries: FavoriteRef[] = [];
  for (const candidate of payload.entries) {
    const ref = parseFavoriteRef(candidate);
    if (ref === null) {
      continue;
    }
    const key = favoriteKey(ref);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push(ref);
    if (entries.length >= MAX_VISITOR_FAVORITES) {
      break;
    }
  }
  return entries;
}

/**
 * Serialises the favourites into the stored payload shape.
 *
 * Entries that are not valid are dropped rather than written, so a bug
 * upstream cannot persist a payload the parser would later reject.
 */
export function serializeVisitorFavorites(
  entries: readonly FavoriteRef[]
): string {
  const seen = new Set<string>();
  const bounded: Array<{ kind: FavoriteKind; id: string }> = [];
  for (const candidate of entries) {
    const ref = parseFavoriteRef(candidate);
    if (ref === null) {
      continue;
    }
    const key = favoriteKey(ref);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    bounded.push({ kind: ref.kind, id: ref.id });
    if (bounded.length >= MAX_VISITOR_FAVORITES) {
      break;
    }
  }
  return JSON.stringify({ version: FAVORITES_STORAGE_VERSION, entries: bounded });
}

/** True when the entry is already in the favourites. */
export function isVisitorFavorite(
  entries: readonly FavoriteRef[],
  ref: FavoriteRef
): boolean {
  const key = favoriteKey(ref);
  return entries.some((entry) => favoriteKey(entry) === key);
}

/** Adds the entry to the favourites (no-op when it is already there). */
export function addVisitorFavorite(
  entries: readonly FavoriteRef[],
  ref: FavoriteRef
): FavoriteRef[] {
  if (isVisitorFavorite(entries, ref)) {
    return [...entries];
  }
  if (entries.length >= MAX_VISITOR_FAVORITES) {
    return [...entries];
  }
  return [...entries, { kind: ref.kind, id: ref.id }];
}

/** Removes the entry from the favourites (no-op when it is not there). */
export function removeVisitorFavorite(
  entries: readonly FavoriteRef[],
  ref: FavoriteRef
): FavoriteRef[] {
  const key = favoriteKey(ref);
  return entries.filter((entry) => favoriteKey(entry) !== key);
}

/**
 * Adds the entry when it is missing and removes it when it is present.
 *
 * Returns a new array in both cases, so the caller can always treat the result
 * as the next state.
 */
export function toggleVisitorFavorite(
  entries: readonly FavoriteRef[],
  ref: FavoriteRef
): FavoriteRef[] {
  return isVisitorFavorite(entries, ref)
    ? removeVisitorFavorite(entries, ref)
    : addVisitorFavorite(entries, ref);
}
