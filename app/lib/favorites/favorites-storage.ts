import {
  FAVORITES_CHANGED_EVENT,
  FAVORITES_STORAGE_KEY,
  parseVisitorFavorites,
  serializeVisitorFavorites,
  type FavoriteRef,
} from "./favorites-model.ts";

/**
 * Browser adapter for the visitor's favourites (task `05-06`).
 *
 * Everything here is **defensive on purpose**:
 *
 * - `localStorage` throws in more situations than people expect — Safari
 *   private mode, disabled site data, an exhausted quota, a sandboxed iframe
 *   without `allow-same-origin`. Every access is wrapped, and a failure is
 *   reported, never thrown.
 * - The module never touches `window` at import time, and never at all on the
 *   server: `typeof window === "undefined"` is checked first, so importing
 *   this file from a Server Component (or during a server render) is safe and
 *   simply yields an empty list.
 *
 * The pure rules live in `favorites-model.ts`; this file is only the I/O.
 *
 * The reads are **cached by the raw stored string**, so two reads that see the
 * same storage contents return the *same array instance*. That is what lets
 * the React components subscribe to the storage with `useSyncExternalStore`
 * without an infinite render loop.
 */

/** A cached read of the visitor's favourites. */
export interface VisitorFavoritesSnapshot {
  /** True when the browser can store favourites at all. */
  available: boolean;
  /** The stored favourites (empty when storage is unavailable). */
  entries: FavoriteRef[];
}

/** The snapshot used when there is no browser (server render). */
const SERVER_SNAPSHOT: VisitorFavoritesSnapshot = Object.freeze({
  available: false,
  entries: Object.freeze([]) as unknown as FavoriteRef[],
});

/**
 * The window the successful availability probe was made against.
 *
 * A successful probe is cached, because it is the common case and the probe
 * writes to storage. The cache is bound to the window object so a failed probe
 * is retried (storage can become available again) and a different window
 * (a test double, an iframe) is probed again.
 */
let probedWindow: Window | null = null;
let probedAvailable = false;

/** Cached read, keyed by the raw stored string. */
let cachedRaw: string | null = null;
let cachedAvailable: boolean | null = null;
let cachedSnapshot: VisitorFavoritesSnapshot | null = null;

/**
 * True when favourites can actually be stored in this browser.
 *
 * Probes `localStorage` with a throwaway write (a read-only check would pass
 * in browsers that allow reads but reject writes). Never throws.
 */
export function isVisitorFavoritesAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (probedWindow === window && probedAvailable) {
    return true;
  }
  let available = false;
  try {
    const storage = window.localStorage;
    if (storage) {
      const probe = "mlbb-showcase.probe";
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      available = true;
    }
  } catch {
    available = false;
  }
  probedWindow = available ? window : null;
  probedAvailable = available;
  return available;
}

/** Reads the raw stored value, or `null` when it cannot be read. */
function readRaw(): string | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem(FAVORITES_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Reads the stored favourites **and** whether storage works.
 *
 * The returned object is referentially stable while the stored value does not
 * change, which is what `useSyncExternalStore` requires.
 */
export function readVisitorFavoritesSnapshot(): VisitorFavoritesSnapshot {
  if (typeof window === "undefined") {
    return SERVER_SNAPSHOT;
  }
  const available = isVisitorFavoritesAvailable();
  const raw = available ? readRaw() : null;

  if (
    cachedSnapshot !== null &&
    cachedRaw === raw &&
    cachedAvailable === available
  ) {
    return cachedSnapshot;
  }

  const entries = available ? parseVisitorFavorites(raw) : [];
  const snapshot: VisitorFavoritesSnapshot = { available, entries };
  cachedRaw = raw;
  cachedAvailable = available;
  cachedSnapshot = snapshot;
  return snapshot;
}

/**
 * Reads the stored favourites.
 *
 * Returns an empty list when storage is unavailable or the stored value is
 * malformed — a broken value must never break the page.
 */
export function readVisitorFavorites(): FavoriteRef[] {
  return readVisitorFavoritesSnapshot().entries;
}

/**
 * Writes the favourites.
 *
 * Returns `true` when the value was stored and `false` when it could not be
 * (unavailable storage or a quota error), so the UI can tell the visitor that
 * their choice was not saved instead of pretending it was.
 */
export function writeVisitorFavorites(entries: readonly FavoriteRef[]): boolean {
  try {
    if (typeof window === "undefined") {
      return false;
    }
    const storage = window.localStorage;
    if (!storage) {
      return false;
    }
    const serialized = serializeVisitorFavorites(entries);
    storage.setItem(FAVORITES_STORAGE_KEY, serialized);
    probedWindow = window;
    probedAvailable = true;
    // Keep the read cache in step with what was just written.
    cachedRaw = serialized;
    cachedAvailable = true;
    cachedSnapshot = {
      available: true,
      entries: parseVisitorFavorites(serialized),
    };
    notifyVisitorFavoritesChanged();
    return true;
  } catch {
    return false;
  }
}

/**
 * Tells the other components that the favourites changed.
 *
 * `localStorage` has no change event, so the toggles and the favourites panel
 * use this broadcast to stay in sync. Failures are ignored — the event is a
 * convenience, never a requirement for correctness.
 */
export function notifyVisitorFavoritesChanged(): void {
  try {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
  } catch {
    // A browser without `Event` support is not a reason to break the page.
  }
}
