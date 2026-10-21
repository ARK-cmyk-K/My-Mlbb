"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MouseEvent } from "react";

import {
  ExplorerEmptyState,
  ExplorerHeroCard,
  ExplorerSkinCard,
} from "./explorer-cards";
import {
  ExplorerControls,
  ExplorerViewSwitcher,
} from "./explorer-controls";
import { ComparisonModal } from "@/app/components/compare/comparison-modal";
import { CompareTray } from "@/app/components/compare/compare-tray";
import { QuickViewModal } from "@/app/components/compare/quick-view-modal";
import {
  resolveComparisonEntries,
  resolveEntry,
  type EntryRef,
} from "@/app/lib/compare/compare-model";
import {
  buildExplorerStatusLine,
  clearExplorerFilters,
  countActiveFilters,
  explorerStateKey,
  explorerStateToSearch,
  runExplorer,
  withPage,
  withView,
  type ExplorerCollection,
  type ExplorerState,
  type ExplorerView,
} from "@/app/lib/explorer/explorer-model";
import { formatCount } from "@/app/lib/showcase/showcase-model";

/**
 * Collection explorer (task 05-04): hero/skin views, search, filters, and
 * bounded results over the published release only.
 *
 * Responsibilities are split so the interesting logic stays testable and the
 * component stays declarative:
 *
 * - `app/lib/explorer/explorer-model.ts` (pure) derives facets, filtered
 *   results, ordering and the page slice from `(collection, state)`.
 * - This component owns *state*: it starts from the server-parsed URL state,
 *   applies changes instantly on the client, and keeps the URL in sync with a
 *   debounced `history.replaceState` so a filtered view stays shareable and the
 *   back/forward buttons land on real server-rendered states.
 * - `ExplorerControls` owns the form semantics (a real `GET` form, so the page
 *   still filters without JavaScript — the server parses the same URL with the
 *   same pure parser and renders the same result).
 *
 * The server render and the hydrated client render call the same pure
 * `runExplorer()` with the same inputs, so the HTML first delivered always
 * matches what the controls display — no hydration drift, no invented data.
 *
 * Task `05-05` adds the two overlay surfaces on top of that: a **quick view**
 * for one published entry and a **two-item comparison** (Skin View and Hero
 * Performance View). This component owns which entry is open and which two
 * entries are queued for comparison; the modals themselves are separate
 * components and all of their data comes from the published collection.
 *
 * Deliberately out of scope here: visitor favourites persisted in browser
 * storage and social sharing — both belong to task `05-06`.
 */

/** Delay before writing filter changes to the URL (also avoids history-API rate limits while typing). */
const URL_SYNC_DELAY_MS = 300;

export interface CollectionExplorerProps {
  /** Published heroes and skins resolved by the server component. */
  collection: ExplorerCollection;
  /** State parsed from the request URL by the server component. */
  initialState: ExplorerState;
}

export function CollectionExplorer({
  collection,
  initialState,
}: CollectionExplorerProps) {
  const [state, setState] = useState<ExplorerState>(initialState);
  const idPrefix = `explorer-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const sectionRef = useRef<HTMLElement | null>(null);

  // Overlay state (task 05-05). Only *references* are stored — the entries
  // themselves are resolved from the published collection on every render, so
  // a modal can never show a stale or half-populated entry.
  const [quickViewRef, setQuickViewRef] = useState<EntryRef | null>(null);
  const [compareRefs, setCompareRefs] = useState<EntryRef[]>([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const propsKey = explorerStateKey(initialState);
  const adoptedKeyRef = useRef(propsKey);

  // A real navigation (link, reload, back/forward) hands down a new URL state;
  // adopt it. Client-side filter changes never touch `initialState`, so this
  // cannot fight the visitor's own edits.
  useEffect(() => {
    if (adoptedKeyRef.current !== propsKey) {
      adoptedKeyRef.current = propsKey;
      setState(initialState);
    }
  }, [propsKey, initialState]);

  // Shallow URL sync: the state is already reflected in the rendered results,
  // so only the address bar needs updating — no server round-trip per keystroke.
  useEffect(() => {
    const search = explorerStateToSearch(state);
    adoptedKeyRef.current = explorerStateKey(state);
    const timer = window.setTimeout(() => {
      const target = `${window.location.pathname}${search}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== target) {
        window.history.replaceState(window.history.state, "", target);
      }
    }, URL_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const run = runExplorer(collection, state);

  // Bring the new page's first row into view after paging (instant scroll, so
  // it stays friendly to reduced-motion users).
  const lastPageRef = useRef(run.page);
  useEffect(() => {
    if (lastPageRef.current !== run.page) {
      lastPageRef.current = run.page;
      sectionRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, [run.page]);

  const counts: Record<ExplorerView, number> = {
    heroes: collection.heroes.length,
    skins: collection.skins.length,
  };
  const viewTotal = counts[state.view];
  const activeFilters = countActiveFilters(state.filters);

  const quickViewEntry = quickViewRef
    ? resolveEntry(collection, quickViewRef)
    : null;
  const compareEntries = resolveComparisonEntries(collection, compareRefs);

  /** Adds an entry to the comparison tray, or removes it when it is there. */
  function toggleCompare(ref: EntryRef) {
    setCompareRefs((current) => {
      const index = current.findIndex(
        (entry) => entry.kind === ref.kind && entry.id === ref.id
      );
      if (index >= 0) {
        return current.filter((_, position) => position !== index);
      }
      if (current.length >= 2) {
        // The tray holds two entries; a third selection replaces the oldest.
        return [current[1], ref];
      }
      return [...current, ref];
    });
  }

  function isCompared(ref: EntryRef): boolean {
    return compareRefs.some(
      (entry) => entry.kind === ref.kind && entry.id === ref.id
    );
  }

  const compareStatus =
    compareEntries.length === 0
      ? ""
      : compareEntries.length === 1
        ? `${compareEntries[0].name} selected for comparison. Choose one more entry.`
        : `${compareEntries[0].name} and ${compareEntries[1].name} selected for comparison.`;

  return (
    <section
      ref={sectionRef}
      aria-labelledby={`${idPrefix}-heading`}
      className="mt-8 scroll-mt-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2
          id={`${idPrefix}-heading`}
          className="font-display text-xl font-semibold text-foreground"
        >
          {state.view === "heroes" ? "Published heroes" : "Published skins"}
        </h2>
        <ExplorerViewSwitcher
          state={state}
          counts={counts}
          onChange={setState}
        />
      </div>

      {viewTotal === 0 ? (
        <div className="mt-4">
          <ExplorerEmptyState
            message={
              state.view === "heroes"
                ? "No heroes are published in this release yet."
                : "No skins are published in this release yet."
            }
            action={
              state.view === "heroes" && counts.skins > 0
                ? {
                    label: "Browse the published skins instead",
                    href: `/collection${explorerStateToSearch(withView(state, "skins"))}`,
                    onClick: () => setState(withView(state, "skins")),
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <ExplorerControls
              state={state}
              facets={run.facets}
              onChange={setState}
              idPrefix={idPrefix}
            />
          </div>

          {run.matchingCount === 0 ? (
            <div className="mt-6">
              <ExplorerEmptyState
                message="No published entries match your filters."
                action={{
                  label: activeFilters > 0 ? "Clear filters" : "Reset the explorer",
                  href: `/collection${explorerStateToSearch(clearExplorerFilters(state))}`,
                  onClick: () => setState(clearExplorerFilters(state)),
                }}
              />
            </div>
          ) : (
            <>
              <p
                role="status"
                className="mt-6 text-sm text-muted"
              >
                {buildExplorerStatusLine(run.range, run.matchingCount, viewTotal, state.view, activeFilters)}
              </p>

              <ul
                role="list"
                className="mt-4 grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {state.view === "heroes"
                  ? run.heroes.map((entry) => {
                      const ref: EntryRef = { kind: "hero", id: entry.id };
                      return (
                        <li key={entry.id}>
                          <ExplorerHeroCard
                            hero={entry}
                            actions={{
                              onQuickView: () => setQuickViewRef(ref),
                              onCompare: () => toggleCompare(ref),
                              compareSelected: isCompared(ref),
                            }}
                          />
                        </li>
                      );
                    })
                  : run.skins.map((entry) => {
                      const ref: EntryRef = { kind: "skin", id: entry.id };
                      return (
                        <li key={entry.id}>
                          <ExplorerSkinCard
                            skin={entry}
                            heroName={
                              entry.heroId === null
                                ? undefined
                                : findHeroName(collection, entry.heroId)
                            }
                            actions={{
                              onQuickView: () => setQuickViewRef(ref),
                              onCompare: () => toggleCompare(ref),
                              compareSelected: isCompared(ref),
                            }}
                          />
                        </li>
                      );
                    })}
              </ul>

              <PageNav
                state={state}
                page={run.page}
                pageCount={run.pageCount}
                onChange={setState}
                className="mt-8"
              />
            </>
          )}
        </>
      )}

      {/* Announced politely whenever the comparison selection changes. */}
      <p role="status" className="sr-only">
        {compareStatus}
      </p>

      {compareEntries.length > 0 ? (
        <CompareTray
          entries={compareEntries}
          onClear={() => setCompareRefs([])}
          onOpen={() => setComparisonOpen(true)}
        />
      ) : null}

      {quickViewEntry ? (
        <QuickViewModal
          collection={collection}
          entry={quickViewEntry}
          onClose={() => setQuickViewRef(null)}
        />
      ) : null}

      {comparisonOpen && compareEntries.length === 2 ? (
        <ComparisonModal
          collection={collection}
          entries={compareEntries}
          onClose={() => setComparisonOpen(false)}
        />
      ) : null}
    </section>
  );
}

function PageNav({
  state,
  page,
  pageCount,
  onChange,
  className = "",
}: {
  state: ExplorerState;
  page: number;
  pageCount: number;
  onChange: (next: ExplorerState) => void;
  className?: string;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const linkClass =
    "inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong";
  const disabledClass =
    "inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface px-4 py-2 text-sm font-medium text-muted/60";

  function go(target: number, event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onChange(withPage(state, target));
  }

  const previousHref = `/collection${explorerStateToSearch(withPage(state, page - 1))}`;
  const nextHref = `/collection${explorerStateToSearch(withPage(state, page + 1))}`;

  return (
    <nav aria-label="Collection result pages" className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      {page > 1 ? (
        <a
          href={previousHref}
          rel="prev"
          onClick={(event) => go(page - 1, event)}
          className={linkClass}
        >
          ← Previous
        </a>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          ← Previous
        </span>
      )}

      <p className="text-sm text-muted">
        Page{" "}
        <span className="font-mono tabular-nums text-foreground">
          {formatCount(page)}
        </span>{" "}
        of{" "}
        <span className="font-mono tabular-nums text-foreground">
          {formatCount(pageCount)}
        </span>
      </p>

      {page < pageCount ? (
        <a
          href={nextHref}
          rel="next"
          onClick={(event) => go(page + 1, event)}
          className={linkClass}
        >
          Next →
        </a>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Next →
        </span>
      )}
    </nav>
  );
}

function findHeroName(
  collection: ExplorerCollection,
  heroId: string
): string | undefined {
  return collection.heroes.find((entry) => entry.id === heroId)?.name;
}
