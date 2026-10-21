"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";

import { ModalShell } from "@/app/components/compare/modal-shell";
import {
  EMPTY_SEARCH_RESULTS,
  SEARCH_CATEGORIES,
  buildSearchResultHref,
  countSearchResults,
  flattenSearchResults,
  isSearchableQuery,
  normalizeSearchQuery,
  searchCategoryLabel,
  type CategorizedSearchResults,
  type FlatSearchResult,
} from "@/app/lib/search/search-model";

/**
 * Global search (task `06-01`).
 *
 * A Cmd/Ctrl+K search over the **published** collection, available on every
 * public page.
 *
 * Behaviour:
 *
 * - **Shortcut** — Cmd+K on macOS, Ctrl+K elsewhere, from anywhere on the
 *   page. The trigger button in the header is the mouse equivalent.
 * - **Debounced** — the query is sent after a short pause, and an in-flight
 *   request is aborted when the query changes, so a fast typist does not
 *   queue a request per keystroke.
 * - **Published only** — the browser never talks to the database; it calls
 *   `/api/search`, which uses the approved published-only RPC.
 * - **Keyboard** — the input is a combobox: `ArrowDown`/`ArrowUp` move the
 *   active option, `Enter` opens it, `Escape` closes the dialog. The active
 *   option is published through `aria-activedescendant`, so a screen reader
 *   announces it without moving the focus out of the input.
 * - **States** — idle, searching, results, no results and a store failure are
 *   all distinguished, and the status line is a live region.
 */

const SEARCH_DEBOUNCE_MS = 200;

/** The shortcut hint never changes while the page is open. */
function subscribeToNothing(): () => void {
  return () => {};
}

/** True on Apple platforms, so the hint shows the right symbol. */
function detectApplePlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] =
    useState<CategorizedSearchResults>(EMPTY_SEARCH_RESULTS);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [fetchedQuery, setFetchedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const idPrefix = `global-search-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const inputRef = useRef<HTMLInputElement>(null);

  const isApple = useSyncExternalStore(
    subscribeToNothing,
    detectApplePlatform,
    () => false
  );

  const normalized = normalizeSearchQuery(query);
  const searchable = isSearchableQuery(normalized);
  const flat = flattenSearchResults(results, idPrefix);
  const total = countSearchResults(results);
  const searching = phase === "loading" || (searchable && fetchedQuery !== normalized);

  // The shortcut works from anywhere, including while another field has focus.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Run the search. The request is debounced and aborted when the query
  // changes, so only the newest query is ever applied.
  useEffect(() => {
    if (!open || !searchable) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/search?q=${encodeURIComponent(normalized)}`,
            {
              signal: controller.signal,
              headers: { Accept: "application/json" },
            }
          );
          const payload = (await response.json()) as {
            status?: string;
            results?: CategorizedSearchResults;
          };
          if (!response.ok || payload.status !== "ok") {
            setPhase("error");
            setFetchedQuery(normalized);
            return;
          }
          setResults(payload.results ?? EMPTY_SEARCH_RESULTS);
          setPhase("ready");
          setFetchedQuery(normalized);
          setActiveIndex(0);
        } catch {
          if (controller.signal.aborted) {
            return;
          }
          setPhase("error");
          setFetchedQuery(normalized);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, open, searchable]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY_SEARCH_RESULTS);
    setPhase("idle");
    setFetchedQuery("");
    setActiveIndex(0);
  }

  function openSearch() {
    setOpen(true);
  }

  function moveActive(delta: number) {
    if (flat.length === 0) {
      return;
    }
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) {
        return flat.length - 1;
      }
      if (next >= flat.length) {
        return 0;
      }
      return next;
    });
  }

  function goTo(result: FlatSearchResult) {
    router.push(buildSearchResultHref(result.category, result));
    close();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Enter") {
      const active = flat[activeIndex];
      if (active) {
        event.preventDefault();
        goTo(active);
      }
    }
  }

  const statusText = buildStatusText({
    phase,
    searchable,
    searching,
    total,
    normalized,
  });

  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
      >
        <span aria-hidden="true">⌕</span>
        Search
        <kbd className="ml-1 hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted sm:inline">
          {isApple ? "⌘K" : "Ctrl K"}
        </kbd>
        <span className="sr-only">
          {isApple
            ? "Open the search dialog (Command K)"
            : "Open the search dialog (Control K)"}
        </span>
      </button>

      {open ? (
        <ModalShell
          labelledBy={`${idPrefix}-title`}
          onClose={close}
          initialFocusRef={inputRef}
          panelClassName="sm:max-w-xl"
        >
          <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3">
            <h2
              id={`${idPrefix}-title`}
              className="font-display text-base font-semibold text-foreground"
            >
              Search the collection
            </h2>
            <label className="sr-only" htmlFor={`${idPrefix}-input`}>
              Search published heroes, skins, achievements and timeline entries
            </label>
            <input
              ref={inputRef}
              id={`${idPrefix}-input`}
              type="search"
              value={query}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search heroes, skins, achievements…"
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls={`${idPrefix}-listbox`}
              aria-autocomplete="list"
              aria-activedescendant={
                flat[activeIndex] ? flat[activeIndex].domId : undefined
              }
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-focus"
            />
            <p role="status" className="text-xs text-muted">
              {statusText}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {flat.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted">
                {searchable
                  ? phase === "error"
                    ? "Search is unavailable right now. Please try again later."
                    : "No published entries match your search."
                  : "Type at least two characters to search."}
              </p>
            ) : (
              <div
                id={`${idPrefix}-listbox`}
                role="listbox"
                aria-label="Search results"
                className="flex flex-col gap-3"
              >
                {SEARCH_CATEGORIES.map((category) => {
                  const items = results[category.id];
                  if (items.length === 0) {
                    return null;
                  }
                  return (
                    <div
                      key={category.id}
                      role="group"
                      aria-label={searchCategoryLabel(category.id)}
                    >
                      <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                        {searchCategoryLabel(category.id)}
                      </p>
                      {items.map((item) => {
                        const option = flat.find(
                          (candidate) =>
                            candidate.category === category.id &&
                            candidate.id === item.id
                        );
                        if (!option) {
                          return null;
                        }
                        const active = option.index === activeIndex;
                        return (
                          // The ARIA combobox pattern: the options are not
                          // focusable. The text input keeps the focus and
                          // points at the active option with
                          // `aria-activedescendant`; the keyboard is handled
                          // by the input, the pointer by the click handler.
                          // eslint-disable-next-line jsx-a11y/interactive-supports-focus, jsx-a11y/click-events-have-key-events
                          <div
                            key={option.domId}
                            id={option.domId}
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setActiveIndex(option.index)}
                            onClick={() => goTo(option)}
                            className={`cursor-pointer rounded-lg px-2 py-2 ${
                              active ? "bg-primary/10" : ""
                            }`}
                          >
                            <p className="text-sm font-medium text-foreground">
                              {option.title}
                            </p>
                            {option.subtitle ? (
                              <p className="text-xs text-muted">
                                {option.subtitle}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

/** The single sentence the live region announces. */
function buildStatusText({
  phase,
  searchable,
  searching,
  total,
  normalized,
}: {
  phase: "idle" | "loading" | "ready" | "error";
  searchable: boolean;
  searching: boolean;
  total: number;
  normalized: string;
}): string {
  if (!searchable) {
    return "Type at least two characters to search.";
  }
  if (phase === "error") {
    return "Search is unavailable right now.";
  }
  if (searching) {
    return "Searching…";
  }
  if (total === 0) {
    return `No published entries match “${normalized}”.`;
  }
  return `${total} published ${total === 1 ? "result" : "results"} for “${normalized}”.`;
}
