"use client";

import { useId } from "react";

import { MediaFrame } from "@/app/components/media-frame";
import { FavoriteToggle } from "@/app/components/favorites/favorite-toggle";
import { ShareActions } from "@/app/components/share/share-actions";
import { DetailRowList, EntryBadges, EntryIdentity } from "./detail-views";
import { ModalShell } from "./modal-shell";
import {
  buildQuickViewModel,
  type EntryDetails,
  type PublishedCollection,
} from "@/app/lib/compare/compare-model";

/**
 * Quick view modal (task 05-05).
 *
 * Shows everything the published release knows about a single hero or skin:
 * the artwork, the identity chips, and — depending on the entry type — the
 * skin attributes and/or the hero's performance.
 *
 * Every value comes from the pure model in `app/lib/compare/compare-model.ts`,
 * so a datum that was never recorded is reported as "not recorded" instead of
 * being filled in with a plausible number.
 *
 * The overlay behaviour (Escape, focus management, focus trap, scroll lock,
 * reduced motion) lives in {@link ModalShell}.
 */
export function QuickViewModal({
  collection,
  entry,
  onClose,
}: {
  collection: PublishedCollection;
  entry: EntryDetails;
  onClose: () => void;
}) {
  const idPrefix = `quickview-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const model = buildQuickViewModel(collection, entry);

  return (
    <ModalShell labelledBy={`${idPrefix}-title`} onClose={onClose}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <EntryIdentity entry={model.entry} headingLevel={2} id={`${idPrefix}-title`} />
          <div className="mt-2">
            <EntryBadges badges={model.entry.badges} />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick view"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-border-strong hover:bg-surface-raised"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <MediaFrame
          mediaId={model.entry.mediaId}
          alt={model.entry.mediaAlt}
          name={model.entry.name}
          className="aspect-[16/10] rounded-xl border border-border"
        />

        {model.sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`${idPrefix}-${section.id}`}
            className="mt-5"
          >
            <h3
              id={`${idPrefix}-${section.id}`}
              className="font-display text-sm font-semibold uppercase tracking-wider text-foreground"
            >
              {section.title}
            </h3>
            {section.emptyMessage ? (
              <p className="mt-2 rounded-lg border border-dashed border-border bg-surface-raised/40 p-3 text-sm text-muted">
                {section.emptyMessage}
              </p>
            ) : (
              <div className="mt-1">
                <DetailRowList rows={section.rows} />
              </div>
            )}
          </section>
        ))}

        <section
          aria-labelledby={`${idPrefix}-actions`}
          className="mt-6 border-t border-border pt-4"
        >
          <h3
            id={`${idPrefix}-actions`}
            className="font-display text-sm font-semibold uppercase tracking-wider text-foreground"
          >
            Keep or share
          </h3>
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <FavoriteToggle
              showLabel
              target={{
                kind: model.entry.kind,
                id: model.entry.id,
                name: model.entry.name,
                slug: model.entry.slug,
              }}
            />
            <ShareActions
              target={{
                kind: model.entry.kind,
                id: model.entry.id,
                name: model.entry.name,
                slug: model.entry.slug,
              }}
              context={model.entry.context}
            />
          </div>
        </section>
      </div>
    </ModalShell>
  );
}
