import assert from "node:assert/strict";
import { test } from "node:test";

import { FAVORITES_STORAGE_KEY } from "./favorites-model.ts";
import {
  isVisitorFavoritesAvailable,
  readVisitorFavorites,
  writeVisitorFavorites,
} from "./favorites-storage.ts";

/**
 * Visitor-favourites storage tests (task 05-06).
 *
 * The contract under test:
 *
 * - **hydration safety.** The module never touches `window` at import time and
 *   returns an empty list when there is no browser, so importing it from a
 *   Server Component (or rendering a client component on the server) cannot
 *   throw. The test process has no `window` at all, which is exactly the
 *   server-render situation.
 * - **graceful degradation.** Storage that throws on access (private mode,
 *   disabled site data) is reported as unavailable instead of crashing the
 *   page.
 * - **safe parsing.** A malformed stored value yields an empty list.
 */

/** Minimal in-memory `localStorage` double. */
function createStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem(key: string) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

/** Installs a fake `window` and returns a restore function. */
function installWindow(fake: unknown): () => void {
  const globals = globalThis as { window?: unknown };
  const previous = globals.window;
  globals.window = fake;
  return () => {
    if (previous === undefined) {
      delete globals.window;
    } else {
      globals.window = previous;
    }
  };
}

test("without a browser the module reports no storage and no favourites", () => {
  // The test runner has no `window`, so this is the server-render path.
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(isVisitorFavoritesAvailable(), false);
  assert.deepEqual(readVisitorFavorites(), []);
  assert.equal(writeVisitorFavorites([{ kind: "hero", id: "hero-1" }]), false);
});

test("a browser with working storage round-trips the favourites", () => {
  const storage = createStorage();
  const restore = installWindow({ localStorage: storage });
  try {
    assert.equal(isVisitorFavoritesAvailable(), true);
    assert.deepEqual(readVisitorFavorites(), []);

    assert.equal(
      writeVisitorFavorites([
        { kind: "hero", id: "hero-1" },
        { kind: "skin", id: "skin-1" },
      ]),
      true
    );
    assert.deepEqual(readVisitorFavorites(), [
      { kind: "hero", id: "hero-1" },
      { kind: "skin", id: "skin-1" },
    ]);
    assert.ok(storage.data.has(FAVORITES_STORAGE_KEY));
  } finally {
    restore();
  }
});

test("a malformed stored value is treated as an empty list", () => {
  const storage = createStorage({ [FAVORITES_STORAGE_KEY]: "{not json" });
  const restore = installWindow({ localStorage: storage });
  try {
    assert.deepEqual(readVisitorFavorites(), []);
  } finally {
    restore();
  }
});

test("storage that throws is reported as unavailable, not fatal", () => {
  const hostile = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  const restore = installWindow({ localStorage: hostile });
  try {
    assert.equal(isVisitorFavoritesAvailable(), false);
    assert.deepEqual(readVisitorFavorites(), []);
    assert.equal(writeVisitorFavorites([{ kind: "hero", id: "hero-1" }]), false);
  } finally {
    restore();
  }
});

test("a browser without localStorage at all is handled", () => {
  const restore = installWindow({});
  try {
    assert.equal(isVisitorFavoritesAvailable(), false);
    assert.deepEqual(readVisitorFavorites(), []);
    assert.equal(writeVisitorFavorites([{ kind: "hero", id: "hero-1" }]), false);
  } finally {
    restore();
  }
});
