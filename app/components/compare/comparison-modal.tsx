"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { MediaFrame } from "@/app/components/media-frame";
import { DetailValue, EntryBadges, EntryIdentity } from "./detail-views";
import { ModalShell } from "./modal-shell";
import {
  COMPARISON_TABS,
  buildComparisonModel,
  type ComparisonTab,
  type EntryDetails,
  type PublishedCollection,
} from "@/app/lib/compare/compare-model";
import { resolveTabKeyIndex } from "@/app/lib/showcase/showcase-model";

/**
 * Two-item comparison modal (task 05-05).
 *
 * The modal shows two published entries side by side and lets the visitor
 * switch between two views of the same pair:
 *
 * - **Skin View** — splash art, rarity, series, painted variant and the
 *   acquisition date/milestone.
 * - **Hero Performance View** — mastery grade, matches, win rate, primary
 *   role and the total number of skins owned.
 *
 * A skin is graded through the hero it belongs to, so comparing two skins
 * compares their heroes. A skin with no linked hero says so instead of
 * showing invented numbers, and a hero compared in the Skin View reports its
 * skin attributes as "not applicable" (a hero is not a skin with a missing
 * rarity).
 *
 * The tabs follow the WAI-ARIA tabs pattern already used by the showcase tabs:
 * a single tab stop with roving `tabIndex`, arrow keys, and `Home`/`End`.
 */
export function ComparisonModal({
  collection,
  entries,
  onClose,
}: {
  collection: PublishedCollection;
  entries: readonly EntryDetails[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ComparisonTab>("skin");
  const idPrefix = `compare-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = Math.max(
    0,
    COMPARISON_TABS.findIndex((entry) => entry.id === tab)
  );

  const tabDomId = (id: ComparisonTab) => `${idPrefix}-${id}-tab`;
  const panelDomId = (id: ComparisonTab) => `${idPrefix}-${id}-panel`;

  function selectTab(index: number) {
    const next = COMPARISON_TABS[index];
    if (!next) {
      return;
    }
    setTab(next.id);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nextIndex = resolveTabKeyIndex(
      event.key,
      activeIndex,
      COMPARISON_TABS.length
    );
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    selectTab(nextIndex);
  }

  const names = entries.map((entry) => entry.name).join(" and ");

  return (
    <ModalShell
      labelledBy={`${idPrefix}-title`}
      onClose={onClose}
      panelClassName="max-w-4xl"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2
            id={`${idPrefix}-title`}
            className="font-display text-lg font-semibold text-foreground"
          >
            Compare
          </h2>
          <p className="mt-0.5 truncate text-xs uppercase tracking-wider text-muted">
            {names}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comparison"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-border-strong hover:bg-surface-raised"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>
      </header>

      <div
        role="tablist"
        aria-label="Comparison views"
        onKeyDown={handleKeyDown}
        className="flex shrink-0 flex-wrap gap-2 border-b border-border px-4 py-3"
      >
        {COMPARISON_TABS.map((definition, index) => {
          const selected = definition.id === tab;
          return (
            <button
              key={definition.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabDomId(definition.id)}
              aria-selected={selected}
              aria-controls={panelDomId(definition.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(index)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {definition.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {COMPARISON_TABS.map((definition) => {
          const selected = definition.id === tab;
          const model = buildComparisonModel(collection, entries, definition.id);
          const labelWidth = 30;
          const valueWidth = Math.max(
            1,
            Math.round((100 - labelWidth) / Math.max(1, model.columns.length))
          );

          return (
            <div
              key={definition.id}
              role="tabpanel"
              id={panelDomId(definition.id)}
              aria-labelledby={tabDomId(definition.id)}
              tabIndex={0}
              hidden={!selected}
            >
              <p className="text-xs text-muted">{definition.summary}</p>
              <table className="mt-3 w-full table-fixed border-collapse text-left">
                <caption className="sr-only">
                  {`${definition.label}: ${definition.summary}`}
                </caption>
                <colgroup>
                  <col style={{ width: `${labelWidth}%` }} />
                  {model.columns.map((column) => (
                    <col key={column.entry.id} style={{ width: `${valueWidth}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="sr-only">
                      Attribute
                    </th>
                    {model.columns.map((column) => (
                      <th
                        key={column.entry.id}
                        scope="col"
                        className="border-b border-border px-2 pb-3 align-bottom"
                      >
                        <div className="flex flex-col gap-2">
                          <MediaFrame
                            mediaId={column.entry.mediaId}
                            alt={column.entry.mediaAlt}
                            name={column.entry.name}
                            className="aspect-[16/10] rounded-lg border border-border"
                          />
                          <EntryIdentity entry={column.entry} headingLevel={3} />
                          <EntryBadges badges={column.entry.badges} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.fields.map((field, index) => (
                    <tr key={field.key} className="border-b border-border/60">
                      <th
                        scope="row"
                        className="px-2 py-2 align-top text-xs font-medium uppercase tracking-wider text-muted"
                      >
                        {field.label}
                      </th>
                      {model.columns.map((column) => {
                        const row = column.rows[index];
                        return (
                          <td
                            key={column.entry.id}
                            className="px-2 py-2 align-top text-sm text-foreground"
                          >
                            {row ? (
                              <DetailValue row={row} />
                            ) : (
                              <span aria-hidden="true">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
