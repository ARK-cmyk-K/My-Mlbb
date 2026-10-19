"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  deleteSkinAction,
  transitionSkinAction,
} from "../../actions/skin-actions";
import type { DraftSkin, DraftState } from "../../lib/content/contracts";
import { resolveDraftTransition } from "../../lib/content/contracts";
import type { SkinActionState } from "../../lib/content/skin-admin";

const INITIAL_STATE: SkinActionState = {};

/**
 * Row-level actions for a skin in the list (task 03-02).
 *
 * Renders the legal lifecycle transitions (Archive/Restore) and a Delete action,
 * each as its own form with `useActionState`. Errors from mutations are shown
 * inline; destructive deletes require a browser confirmation to avoid
 * accidental loss.
 */

export interface SkinRowActionsProps {
  skin: Pick<DraftSkin, "id" | "name" | "publicationState">;
}

export function SkinRowActions({ skin }: SkinRowActionsProps) {
  const [transitionState, transitionFormAction, transitionPending] =
    useActionState(transitionSkinAction, INITIAL_STATE);
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteSkinAction,
    INITIAL_STATE
  );

  const isArchived = skin.publicationState === "archived";
  const archiveTransition = resolveDraftTransition(skin.publicationState, "archive");
  const restoreTransition = resolveDraftTransition(skin.publicationState, "restore");
  const transitionValue = isArchived ? "restore" : "archive";
  const transitionLabel = isArchived ? "Restore" : "Archive";
  const transitionPendingLabel = isArchived ? "Restoring…" : "Archiving…";
  const canTransition = archiveTransition !== null || restoreTransition !== null;

  const error = transitionState.error ?? deleteState.error;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/admin/skins/${skin.id}`}
        className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Edit
      </Link>

      {canTransition ? (
        <form action={transitionFormAction}>
          <input type="hidden" name="id" value={skin.id} />
          <input type="hidden" name="transition" value={transitionValue} />
          <button
            type="submit"
            disabled={transitionPending || deletePending}
            aria-label={`${transitionLabel} “${skin.name}”`}
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
            `Delete “${skin.name}”? This action cannot be undone.`
          );
          if (!confirmed) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={skin.id} />
        <button
          type="submit"
          disabled={transitionPending || deletePending}
          aria-label={`Delete “${skin.name}”`}
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

export function getSkinStateBadge(publicationState: DraftState): string {
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
