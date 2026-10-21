"use client";

import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

import {
  FAVORITES_CHANGED_EVENT,
  removeVisitorFavorite,
  type FavoriteRef,
} from "@/app/lib/favorites/favorites-model";
import {
  readVisitorFavoritesSnapshot,
  writeVisitorFavorites,
} from "@/app/lib/favorites/favorites-storage";
import { buildEntryExplorerPath } from "@/app/lib/favorites/share-model";
import type { ExplorerCollection } from "@/app/lib/explorer/explorer-model";

/**
 * The visitor's saved items (task `05-06`).
 *
 * The list is read from the browser's own storage, so it is **client-only**:
 * the server render and the first client render both produce the same
 * "nothing saved yet" shell, and the real list appears right after hydration.
 * That keeps the markup identical on both sides (no hydration mismatch) and
 * means no `window` access ever happens during a server render.
 *
 * Only published entries can be saved, and only published entries are listed:
 * a saved pointer that no longer matches a published entry is dropped rather
 * than shown as an empty row.
 */

/** The snapshot rendered by the server (and by the first client render). */
const SERVER_SNAPSHOT = { available: false, entries: [] as FavoriteRef[] };

/** Subscribes to the browser-storage broadcasts. */
function subscribeToFavorites(onStoreChange: () => void): () => void {
  window.addEventListener(FAVORITES_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(FAVORITES_CHANGED_EVENT, onStoreChange);
  };
}

interface ResolvedFavorite {
  ref: FavoriteRef;
  name: string;
  slug: string;
  kind: "hero" | "skin";
}

export function FavoritesPanel({
  collection,
}: {
  collection: ExplorerCollection;
}) {
  const getSnapshot = useCallback(() => readVisitorFavoritesSnapshot(), []);
  const getServerSnapshot = useCallback(() => SERVER_SNAPSHOT, []);

  const snapshot = useSyncExternalStore(
    subscribeToFavorites,
    getSnapshot,
    getServerSnapshot
  );

  const resolved = resolveFavorites(snapshot.entries, collection);

  function forget(ref: FavoriteRef) {
    const next = removeVisitorFavorite(
      readVisitorFavoritesSnapshot().entries,
      ref
    );
    writeVisitorFavorites(next);
  }

  return (
    <section
      aria-labelledby="visitor-favorites-heading"
      className="mt-10 rounded-xl border border-border bg-surface/60 p-4 sm:p-5"
    >
      <h2
        id="visitor-favorites-heading"
        className="font-display text-lg font-semibold text-foreground"
      >
        Your saved items
      </h2>
      <p className="mt-1 text-sm text-muted">
        Saved in this browser only — nothing is uploaded and no account is
        needed.
      </p>

      {snapshot.available ? (
        resolved.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nothing saved yet. Use the “Save” button on any hero or skin to
            keep it here.
          </p>
        ) : (
          <ul role="list" className="mt-3 grid list-none gap-2 sm:grid-cols-2">
            {resolved.map((entry) => (
              <li
                key={`${entry.kind}:${entry.ref.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised/60 px-3 py-2"
              >
                <Link
                  href={buildEntryExplorerPath({
                    kind: entry.kind,
                    slug: entry.slug,
                  })}
                  className="min-w-0 truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {entry.name}
                  <span className="ml-2 text-xs uppercase tracking-wider text-muted">
                    {entry.kind === "skin" ? "Skin" : "Hero"}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => forget(entry.ref)}
                  className="shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
                >
                  Remove
                  <span className="sr-only">
                    {` ${entry.name} from your saved items`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

/**
 * Resolves saved pointers against the published collection.
 *
 * A pointer that no longer matches a published entry is dropped, so the panel
 * can never show a name it would have to invent.
 */
function resolveFavorites(
  refs: readonly FavoriteRef[],
  collection: ExplorerCollection
): ResolvedFavorite[] {
  const resolved: ResolvedFavorite[] = [];
  for (const ref of refs) {
    if (ref.kind === "hero") {
      const hero = collection.heroes.find((entry) => entry.id === ref.id);
      if (hero) {
        resolved.push({
          ref,
          name: hero.name,
          slug: hero.slug,
          kind: "hero",
        });
      }
      continue;
    }
    const skin = collection.skins.find((entry) => entry.id === ref.id);
    if (skin) {
      resolved.push({ ref, name: skin.name, slug: skin.slug, kind: "skin" });
    }
  }
  return resolved;
}
