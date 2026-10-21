"use client";

import type { FormEvent } from "react";

import {
  EXPLORER_FAVORITES_OPTIONS,
  EXPLORER_OWNERSHIP_OPTIONS,
  EXPLORER_PARAM_KEYS,
  EXPLORER_RARITY_OPTIONS,
  EXPLORER_ROLE_OPTIONS,
  EXPLORER_VIEWS,
  clearExplorerFilters,
  coerceExplorerOption,
  explorerStateToSearch,
  withFilterPatch,
  withView,
  type ExplorerFacets,
  type ExplorerFilters,
  type ExplorerState,
  type ExplorerView,
} from "@/app/lib/explorer/explorer-model";
import { formatEnumLabel } from "@/app/lib/showcase/showcase-model";

/**
 * Search/filter controls for the collection explorer (task 05-04).
 *
 * The controls are a plain `<form method="get">` first: every field carries its
 * name and current value, so with JavaScript disabled a submission reloads the
 * page and the *server* renders the filtered result from the same URL parser.
 * With JavaScript available the same change is applied instantly client-side
 * (the orchestrator keeps the URL in sync), and `onSubmit` only stops the
 * browser from performing the redundant full-page reload.
 *
 * Every value the UI offers comes from the model's typed option lists, so a
 * `<select>` can never produce a filter value the parser would reject.
 */

export interface ExplorerControlsProps {
  state: ExplorerState;
  facets: ExplorerFacets;
  /** Receives the complete next state (filters always reset to page 1). */
  onChange: (next: ExplorerState) => void;
  /** Stable DOM-id prefix for `label`/`aria-controls` wiring. */
  idPrefix: string;
}

interface FilterChip {
  key: keyof ExplorerFilters;
  label: string;
  patch: Partial<ExplorerFilters>;
}

export function ExplorerControls({
  state,
  facets,
  onChange,
  idPrefix,
}: ExplorerControlsProps) {
  const filters = state.filters;
  const showFavorites =
    state.view === "heroes" ? facets.hasFavoriteHeroes : facets.hasFavoriteSkins;

  function patch(values: Partial<ExplorerFilters>) {
    onChange(withFilterPatch(state, values));
  }

  /**
   * Without JavaScript this is a real GET submission (handled by the server).
   * With JavaScript it is a no-op navigation-wise: values are already applied
   * on change, so the handler only prevents the full-page reload.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Re-reads the text field from the DOM so a browser-restored form value
    // (e.g. after bfcache) can never leave the input and the state disagreeing.
    // Selects are always applied on change; they are deliberately not read here
    // because skin-only filters are intentionally hidden — not cleared — in the
    // heroes view.
    patch({
      query: String(data.get(EXPLORER_PARAM_KEYS.query) ?? ""),
    });
  }

  const chips = buildFilterChips(filters);

  return (
    <form
      action="/collection"
      method="get"
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-surface/60 p-4"
    >
      {/* Keeps the current view when a no-JS visitor submits the form. */}
      <input type="hidden" name={EXPLORER_PARAM_KEYS.view} value={state.view} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label
            htmlFor={`${idPrefix}-q`}
            className="block text-xs uppercase tracking-wider text-muted"
          >
            Search
          </label>
          <input
            id={`${idPrefix}-q`}
            type="search"
            name={EXPLORER_PARAM_KEYS.query}
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder={state.view === "heroes" ? "Search heroes…" : "Search skins…"}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted/70"
          />
        </div>

        {facets.roles.length > 0 ? (
          <SelectField
            id={`${idPrefix}-role`}
            name={EXPLORER_PARAM_KEYS.role}
            label="Role"
            value={filters.role}
            options={EXPLORER_ROLE_OPTIONS.map((role) => ({
              value: role,
              label: role === "all" ? "All roles" : formatEnumLabel(role),
            }))}
            onChange={(value) =>
              patch({ role: coerceExplorerOption(value, EXPLORER_ROLE_OPTIONS) })
            }
          />
        ) : null}

        {state.view === "skins" && facets.rarities.length > 0 ? (
          <SelectField
            id={`${idPrefix}-rarity`}
            name={EXPLORER_PARAM_KEYS.rarity}
            label="Rarity"
            value={filters.rarity}
            options={EXPLORER_RARITY_OPTIONS.map((rarity) => ({
              value: rarity,
              label: rarity === "all" ? "All rarities" : formatEnumLabel(rarity),
            }))}
            onChange={(value) =>
              patch({
                rarity: coerceExplorerOption(value, EXPLORER_RARITY_OPTIONS),
              })
            }
          />
        ) : null}

        {state.view === "skins" && facets.series.length > 0 ? (
          <SelectField
            id={`${idPrefix}-series`}
            name={EXPLORER_PARAM_KEYS.series}
            label="Series"
            value={filters.series}
            options={[
              { value: "all", label: "All series" },
              // A hand-edited URL can name a series the release does not
              // contain; keep it selectable (and visibly active) instead of
              // letting the <select> silently fall back to the first option.
              ...(filters.series !== "all" &&
              !facets.series.includes(filters.series)
                ? [{ value: filters.series, label: filters.series }]
                : []),
              ...facets.series.map((series) => ({ value: series, label: series })),
            ]}
            onChange={(value) => patch({ series: value })}
          />
        ) : null}

        {state.view === "skins" ? (
          <SelectField
            id={`${idPrefix}-owned`}
            name={EXPLORER_PARAM_KEYS.ownership}
            label="Ownership"
            value={filters.ownership}
            options={EXPLORER_OWNERSHIP_OPTIONS.map((ownership) => ({
              value: ownership,
              label:
                ownership === "all"
                  ? "All skins"
                  : ownership === "owned"
                    ? "Owned only"
                    : "Not owned only",
            }))}
            onChange={(value) =>
              patch({
                ownership: coerceExplorerOption(value, EXPLORER_OWNERSHIP_OPTIONS),
              })
            }
          />
        ) : null}

        {showFavorites ? (
          <SelectField
            id={`${idPrefix}-fav`}
            name={EXPLORER_PARAM_KEYS.favorites}
            label="Favorites"
            value={filters.favorites}
            options={EXPLORER_FAVORITES_OPTIONS.map((favorite) => ({
              value: favorite,
              label: favorite === "all" ? "All entries" : "Favorites only",
            }))}
            onChange={(value) =>
              patch({
                favorites: coerceExplorerOption(value, EXPLORER_FAVORITES_OPTIONS),
              })
            }
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
        >
          Search
        </button>

        {chips.length > 0 ? (
          <>
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => patch(chip.patch)}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/70"
              >
                {chip.label}
                <span aria-hidden="true">×</span>
                <span className="sr-only">— remove this filter</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange(clearExplorerFilters(state))}
              className="px-2 py-1 text-xs font-medium text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          </>
        ) : null}
      </div>
    </form>
  );
}

/**
 * View switcher ("Heroes" / "Skins").
 *
 * Rendered as links with `aria-current="page"` rather than ARIA tabs: switching
 * views changes the URL and the result set, which is navigation, and the links
 * keep the switcher usable without JavaScript. With JavaScript the transition is
 * applied instantly instead of reloading.
 */
export function ExplorerViewSwitcher({
  state,
  counts,
  onChange,
}: {
  state: ExplorerState;
  counts: Record<ExplorerView, number>;
  onChange: (next: ExplorerState) => void;
}) {
  return (
    <nav aria-label="Collection views" className="flex flex-wrap gap-2">
      {EXPLORER_VIEWS.map((view) => {
        const active = view === state.view;
        const label = view === "heroes" ? "Heroes" : "Skins";
        const next = withView(state, view);
        const count = counts[view];

        return (
          <a
            key={view}
            href={`/collection${explorerStateToSearch(next)}`}
            aria-current={active ? "page" : undefined}
            onClick={(event) => {
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
              onChange(next);
            }}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {label}
            <span
              aria-hidden="true"
              className="rounded-full bg-surface-raised px-2 py-0.5 font-mono text-xs tabular-nums text-muted"
            >
              {count}
            </span>
            <span className="sr-only">{` — ${count} published`}</span>
          </a>
        );
      })}
    </nav>
  );
}

function SelectField({
  id,
  name,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs uppercase tracking-wider text-muted"
      >
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * One removable chip per active filter, so a filter that its own view cannot
 * display (e.g. rarity while browsing heroes) is still visible and clearable
 * rather than silently active.
 */
function buildFilterChips(filters: ExplorerFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.query !== "") {
    chips.push({
      key: "query",
      label: `Search: “${filters.query}”`,
      patch: { query: "" },
    });
  }
  if (filters.role !== "all") {
    chips.push({
      key: "role",
      label: `Role: ${formatEnumLabel(filters.role)}`,
      patch: { role: "all" },
    });
  }
  if (filters.rarity !== "all") {
    chips.push({
      key: "rarity",
      label: `Rarity: ${formatEnumLabel(filters.rarity)}`,
      patch: { rarity: "all" },
    });
  }
  if (filters.series !== "all") {
    chips.push({
      key: "series",
      label: `Series: ${filters.series}`,
      patch: { series: "all" },
    });
  }
  if (filters.ownership !== "all") {
    chips.push({
      key: "ownership",
      label: `Ownership: ${filters.ownership === "owned" ? "Owned" : "Not owned"}`,
      patch: { ownership: "all" },
    });
  }
  if (filters.favorites !== "all") {
    chips.push({
      key: "favorites",
      label: "Favorites only",
      patch: { favorites: "all" },
    });
  }

  return chips;
}
