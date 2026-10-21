"use client";



/**
 * Stats strip — account stats and collection completeness.
 *
 * Receives stats data from the parent server component. Falls back to minimal
 * placeholder data when no stats are available.
 *
 * The component is intentionally lightweight and does not import the content
 * service directly — it receives pre-resolved data from its parent.
 */
interface StatsStripProps {
  stats?: {
    displayName?: string;
    totalMatches?: number;
    winRate?: number | null;
    rankLabel?: string;
    highestRankLabel?: string;
    avatarMediaId?: string;
  };
  className?: string;
}

export function StatsStrip({
  stats,
  className,
}: StatsStripProps) {
  const showPlaceholder =
    !stats || (!stats.displayName && !stats.totalMatches);

  if (showPlaceholder) {
    return (
      <section
        className={`mt-8 ${className || "max-w-2xl mx-auto"}`}
        aria-label="Stats strip — loading"
      >
        <div className="flex flex-col items-center py-8 text-muted">
          <p className="text-sm">Stats strip — loading…</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`mt-8 ${className || "max-w-2xl mx-auto"}`}
      aria-label="Account stats strip"
    >
      {/* Avatar */}
      {stats?.avatarMediaId && (
        <img
          src={`/showcase-public/${stats.avatarMediaId}.png`}
          alt="Account avatar"
          className="w-20 h-20 rounded-full object-cover mr-4 border-2 border-border"
        />
      ) || (
        <div
          className="w-20 h-20 rounded-full border-2 border-border bg-border/40 flex items-center justify-center"
        >
          <span className="text-xl text-muted">ML</span>
        </div>
      )}

      <div className="space-y-3">
        {stats?.displayName && (
          <h3 className="font-display text-xl font-semibold text-foreground">
            {stats.displayName}
          </h3>
        )}

        {/* Win Rate */}
        {stats?.winRate !== undefined && (
          <p className="text-sm text-muted/60">
            {stats.winRate === null
              ? "Win Rate: —"
              : `Win Rate: ${stats.winRate.toFixed(1)}%`}
          </p>
        )}

        {/* Rank */}
        {stats?.rankLabel && (
          <p className="text-sm text-muted">Rank: {stats.rankLabel}</p>
        )}

        {/* Highest Rank */}
        {stats?.highestRankLabel && (
          <p className="text-sm text-muted">
            Highest: {stats.highestRankLabel}
          </p>
        )}

        {/* Total Matches */}
        {stats?.totalMatches !== undefined && (
          <p className="text-sm font-mono numeric-figure text-foreground">
            Total Matches: {stats.totalMatches.toLocaleString()}
          </p>
        )}
      </div>

      {/* Collection completeness — simplified */}
      {stats && (
        <div className="mt-6 pt-6 border-t border-border/20">
          <p className="text-xs uppercase tracking-wider text-muted/60">
            Collection
          </p>
          <p className="text-sm mt-1">
            — Hero & skin collection data pending
          </p>
        </div>
      )}
    </section>
  );
}