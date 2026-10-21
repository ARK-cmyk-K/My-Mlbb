import { MilestoneTimeline } from "@/app/components/milestone-timeline";
import { ShowcaseTabs } from "@/app/components/showcase-tabs";
import { SpotlightHeader } from "@/app/components/spotlight";
import { StatsStrip } from "@/app/components/stats-strip";
import { contentService } from "@/app/lib/content";
import type { PublishedRelease } from "@/app/lib/content";
import { buildShowcaseModel } from "@/app/lib/showcase/showcase-model";

/**
 * Account stats live in the release snapshot payload (04-05/04-06), which is not
 * part of the `PublishedRelease` DTO yet. The fields are read defensively: a
 * missing snapshot or a missing field simply omits that value instead of
 * inventing one.
 */
interface PublishedAccountStats {
  display_name?: string;
  total_matches?: number;
  win_rate?: number | null;
  rank_label?: string;
  highest_rank_label?: string;
  avatar_media_id?: string | number;
  spotlight_media_id?: string | number;
}

type PublishedHomeRelease = PublishedRelease & {
  release_snapshots?: Array<{ account_stats?: PublishedAccountStats }>;
};

export default async function PublicHome() {
  let published: PublishedHomeRelease | null = null;

  try {
    published = (await contentService.getPublishedRelease()) as PublishedHomeRelease;
  } catch {
    // No published release yet — the page falls back to the shell below.
    published = null;
  }

  const accountStats = published?.release_snapshots?.[0]?.account_stats;
  const featuredHero = published?.heroes?.[0] ?? null;

  const spotlightHero = featuredHero
    ? {
        id: featuredHero.id,
        name: featuredHero.name,
        slug: featuredHero.slug,
        portraitMediaId: featuredHero.portraitMediaId,
        totalMatches: featuredHero.totalMatches,
        winRate: featuredHero.winRate,
        rankLabel: accountStats?.rank_label ?? null,
        highestRankLabel: accountStats?.highest_rank_label ?? null,
      }
    : undefined;

  const spotlightStats = accountStats
    ? {
        totalMatches: accountStats.total_matches,
        winRate: accountStats.win_rate ?? null,
        rankLabel: accountStats.rank_label,
        highestRankLabel: accountStats.highest_rank_label,
        spotlightMediaId: accountStats.spotlight_media_id?.toString(),
      }
    : undefined;

  const stripStats = accountStats
    ? {
        displayName: accountStats.display_name,
        totalMatches: accountStats.total_matches,
        winRate: accountStats.win_rate ?? null,
        rankLabel: accountStats.rank_label,
        highestRankLabel: accountStats.highest_rank_label,
        avatarMediaId: accountStats.avatar_media_id?.toString(),
      }
    : undefined;

  // Derived from the published release only; drafts never reach this page.
  const showcase = buildShowcaseModel(published);
  const heroNames = Object.fromEntries(
    (published?.heroes ?? []).map((entry) => [entry.id, entry.name])
  );

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-center">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
          MLBB Showcase
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted">
          A curated look at the collection — signature heroes, top-tier skins,
          and the milestones behind them.
        </p>

        {/* Spotlight header — cinematic header featuring the signature hero and account */}
        <SpotlightHeader
          hero={spotlightHero ?? undefined}
          stats={spotlightStats}
          className="mt-8"
        />

        {/* Stats strip — account stats and collection completeness */}
        <StatsStrip stats={stripStats} className="mt-8" />
      </div>

      {/* Showcase tabs and milestone timeline — only published entries render */}
      {published ? (
        <div className="mx-auto mt-16 max-w-6xl text-left">
          <ShowcaseTabs
            heroes={showcase.signatureHeroes}
            skins={showcase.topRaritySkins}
            achievements={showcase.recentAchievements}
            heroNames={heroNames}
          />
          <MilestoneTimeline
            entries={showcase.timelineEntries}
            className="mt-14"
          />
        </div>
      ) : null}
    </main>
  );
}
