"use client";

import type { EntryDetails } from "@/app/lib/compare/compare-model";

/**
 * The comparison tray (task 05-05).
 *
 * Holds the two entries the visitor queued and opens the comparison modal. It
 * stays out of the way until something is selected, and the "Compare" button
 * explains what is still missing instead of failing silently.
 *
 * The tray is presentational: the explorer owns the selection state and
 * decides what is compared.
 */
export function CompareTray({
  entries,
  onClear,
  onOpen,
}: {
  entries: readonly EntryDetails[];
  onClear: () => void;
  onOpen: () => void;
}) {
  const ready = entries.length === 2;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-xl flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-raised/95 p-3 shadow-xl backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted">
            Comparison
          </p>
          <p className="truncate text-sm text-foreground">
            {entries.map((entry) => entry.name).join(" vs ")}
          </p>
          {!ready ? (
            <p className="mt-0.5 text-xs text-muted">
              Choose one more entry to compare.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onOpen}
          disabled={!ready}
          className="rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Compare
        </button>
      </div>
    </div>
  );
}
