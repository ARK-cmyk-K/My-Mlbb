"use client";



/**
 * Spotlight header — a cinematic header featuring the signature hero and account.
 *
 * Receives hero and stats data from the parent server component. When no data
 * is available (nothing published yet), renders a graceful placeholder.
 *
 * The component is intentionally lightweight and does not import the content
 * service directly — it receives pre-resolved data from its parent.
 */
interface SpotlightHeaderProps {
  hero?: {
    id: string;
    name: string;
    slug: string;
    portraitMediaId: string | null;
    totalMatches: number;
    winRate: number | null;
    rankLabel: string | null;
    highestRankLabel: string | null;
  };
  stats?: {
    displayName?: string;
    totalMatches?: number;
    winRate?: number | null;
    rankLabel?: string;
    highestRankLabel?: string;
    avatarMediaId?: string;
    spotlightMediaId?: string;
    rankMediaId?: string;
  };
  className?: string;
}

export function SpotlightHeader({
  hero,
  stats,
  className,
}: SpotlightHeaderProps) {
  const showPlaceholder = !hero && !stats;

  if (showPlaceholder) {
    return (
      <section
        className={`mt-8 ${className || "max-w-3xl mx-auto"}`}
        aria-label="Spotlight header — loading"
      >
        <div className="flex flex-col items-center py-12 text-muted">
          <p className="text-sm">Spotlight header & stats strip — loading…</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`relative mt-8 overflow-hidden ${className || "max-w-3xl mx-auto"}`}
      aria-label="Spotlight header"
    >
      {/* Cinematic background media */}
      {stats?.spotlightMediaId && (
        <img
          src={`/showcase-public/${stats.spotlightMediaId}.png`}
          alt="Account spotlight"
          className="absolute inset-0 w-full h-64 -o-object-cover object-cover rounded-t-md"
        />
      )}

      <div className="relative p-6 pt-px">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {hero?.name ?? "Featured Hero"}
        </h2>
        <p className="mt-2 text-lg leading-relaxed text-muted">•••</p>

        {/* Stats panel */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          {stats?.totalMatches !== undefined && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted mb-1">
                Total Matches
              </p>
              <p className="font-mono text-2xl numeric-figure text-foreground">
                {stats.totalMatches.toLocaleString()}
              </p>
            </div>
          )}
          {stats?.winRate !== undefined && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted mb-1">
                Win Rate
              </p>
              {stats.winRate !== null ? (
                <p className="font-mono text-2xl numeric-figure text-foreground">
                  {stats.winRate.toFixed(1)}%
                </p>
              ) : (
                <p className="text-muted/60">—</p>
              )}
            </div>
          )}
          {stats?.rankLabel && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted mb-1">Rank</p>
              <p className="font-mono text-lg text-foreground">{stats.rankLabel}</p>
            </div>
          )}
          {stats?.highestRankLabel && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted mb-1">
                Highest Rank
              </p>
              <p className="font-mono text-lg text-muted">{stats.highestRankLabel}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}