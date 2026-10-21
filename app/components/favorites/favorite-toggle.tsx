"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import {
  FAVORITES_CHANGED_EVENT,
  isVisitorFavorite,
  toggleVisitorFavorite,
  type FavoriteTarget,
} from "@/app/lib/favorites/favorites-model";
import {
  readVisitorFavorites,
  writeVisitorFavorites,
} from "@/app/lib/favorites/favorites-storage";

/**
 * Visitor favourite toggle (task `05-06`).
 *
 * A visitor marks a published hero or skin as "one of mine". The choice lives
 * only in that visitor's browser (`localStorage`) — there is no account, no
 * server-side list and no public like counter, so nothing about the choice is
 * transmitted anywhere.
 *
 * **Hydration safety.** The browser storage is read through
 * `useSyncExternalStore`: the server render and the first client render both
 * use the server snapshot ("not saved"), and the real value is applied right
 * after hydration. The markup therefore matches on both sides — no hydration
 * mismatch — and no `window`/`localStorage` access ever happens during a
 * server render.
 *
 * **Honest feedback.** When the browser refuses to store the value (private
 * mode, disabled site data, exhausted quota) the button says so instead of
 * pretending the choice was saved.
 */

const BUTTON_BASE =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong";

/** Subscribes to the browser-storage broadcasts. */
function subscribeToFavorites(onStoreChange: () => void): () => void {
  window.addEventListener(FAVORITES_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(FAVORITES_CHANGED_EVENT, onStoreChange);
  };
}

export function FavoriteToggle({
  target,
  showLabel = false,
  className = "",
}: {
  /** The published entry the button refers to. */
  target: FavoriteTarget;
  /** Show the text label next to the icon (used in the quick view modal). */
  showLabel?: boolean;
  className?: string;
}) {
  const kind = target.kind;
  const id = target.id;
  const [problem, setProblem] = useState<string | null>(null);

  const getSnapshot = useCallback(
    () => isVisitorFavorite(readVisitorFavorites(), { kind, id }),
    [kind, id]
  );
  const getServerSnapshot = useCallback(() => false, []);

  const saved = useSyncExternalStore(
    subscribeToFavorites,
    getSnapshot,
    getServerSnapshot
  );

  function toggle() {
    const current = readVisitorFavorites();
    const next = toggleVisitorFavorite(current, { kind, id });
    const written = writeVisitorFavorites(next);
    // The stored value is now the source of truth; the store broadcast makes
    // the button update itself.
    setProblem(
      written
        ? null
        : "This browser is not allowing saved items, so the choice could not be kept."
    );
  }

  return (
    <span className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        className={`${BUTTON_BASE} ${
          saved
            ? "border-accent-gold/60 bg-accent-gold-soft text-accent-gold-text"
            : ""
        }`}
      >
        <span aria-hidden="true">{saved ? "★" : "☆"}</span>
        {showLabel ? (
          <span aria-hidden="true">{saved ? "Saved" : "Save"}</span>
        ) : null}
        <span className="sr-only">
          {saved
            ? `Remove ${target.name} from your saved items`
            : `Save ${target.name} to your saved items`}
        </span>
      </button>
      {problem ? (
        <span role="status" className="mt-1 block text-xs text-muted">
          {problem}
        </span>
      ) : null}
    </span>
  );
}
