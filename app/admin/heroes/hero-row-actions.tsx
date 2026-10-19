"use client";

import { useActionState } from "react";

import {
  deleteHeroAction,
  transitionHeroAction,
} from "../../actions/hero-actions";
import type { DraftHero, DraftState } from "../../lib/content/contracts";
import { resolveDraftTransition } from "../../lib/content/contracts";
import type { HeroActionState } from "../../lib/content/hero-admin";

const INITIAL_STATE: HeroActionState = {};

/**
 * Row-level actions for a hero in the list (task 03-01).
 *
 * Renders the legal lifecycle transitions (Archive/Restore) and a Delete
 * action, each as its own form with `useActionState`. Errors from mutations
 * are shown inline; destructive deletes require a browser confirmation to
 * avoid accidental loss.
 */

export interface HeroRowActionsProps {
  hero: Pick<DraftHero, "id" | "name" | "publicationState">;
}

export function HeroRowActions({ hero }: HeroRowActionsProps) {
  const [transitionState, transitionFormAction, transitionPending] =
    useActionState(transitionHeroAction, INITIAL_STATE);
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteHeroAction,
    INITIAL_STATE
  );

  const isArchived = hero.publicationState === "archived";
  const archiveTransition = resolveDraftTransition(hero.publicationState, "archive");
  const restoreTransition = resolveDraftTransition(hero.publicationState, "restore");
  const transitionValue = isArchived ? "restore" : "archive";
  const transitionLabel = isArchived ? "Restore" : "Archive";
  const transitionPendingLabel = isArchived ? "Restoring…" : "Archiving…";
  const canTransition = archiveTransition !== null || restoreTransition !== null;

  const error = transitionState.error ?? deleteState.error;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/admin/heroes/${hero.id}`}
        className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Edit
      </a>

      {canTransition ? (
        <form action={transitionFormAction}>
          <input type="hidden" name="id" value={hero.id} />
          <input type="hidden" name="transition" value={transitionValue} />
          <button
            type="submit"
            disabled={transitionPending || deletePending}
            aria-label={`${transitionLabel} “${hero.name}”`}
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {transitionPending ? transitionPendingLabel : transitionLabel}
          </button>
        </form>
      ) : null}

      <form
        action={deleteFormAction}
        onSubmit={(event) => {
          const confirmed = window.confirm(
            `Delete “${hero.name}”? This action cannot be undone.`
          );
          if (!confirmed) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={hero.id} />
        <button
          type="submit"
          disabled={transitionPending || deletePending}
          aria-label={`Delete “${hero.name}”`}
          className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-accent-gold-text transition-colors hover:bg-surface-raised disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {deletePending ? "Deleting…" : "Delete"}
        </button>
      </form>

      {error ? (
        <span
          role="alert"
          className="inline-block rounded-md bg-surface-raised px-2 py-1 text-xs text-accent-gold-text"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function getHeroStateBadge(publicationState: DraftState): string {
  switch (publicationState) {
    case "archived":
      return "Archived";
    case "published":
      return "Published";
    case "draft":
    default:
      return "Draft";
  }
}
