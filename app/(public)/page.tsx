import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { MilestoneTimeline } from "@/app/components/milestone-timeline";
import { ShowcaseTabs } from "@/app/components/showcase-tabs";
import { SpotlightHeader } from "@/app/components/spotlight";
import { StatsStrip } from "@/app/components/stats-strip";
import { buildShowcaseModel } from "@/app/lib/showcase/showcase-model";

import { loadPublishedRelease, readAccountStats } from "./showcase-data";

/**
 * Metadata for the public homepage (task `06-02`).
 *
 * The canonical URL is the bare homepage: the homepage shows the same
 * published release on every request, so there is nothing to qualify it with.
 * The preview image comes from the `opengraph-image.tsx` file convention in
 * this segment and is generated from the published release — never from a
 * draft entry.
 */
export const metadata: Metadata = {
  title: { absolute: "MLBB Showcase" },
  description:
    "A curated look at the collection — signature heroes, top-tier skins, and the milestones behind them.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "MLBB Showcase",
    description:
      "A curated look at the collection — signature heroes, top-tier skins, and the milestones behind them.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MLBB Showcase",
    description:
      "A curated look at the collection — signature heroes, top-tier skins, and the milestones behind them.",
  },
};

/**
 * Public homepage (tasks 05-01/05-02/05-03).
 *
 * Cache Components layout: the heading and copy are the static shell, and the
 * published data is read inside `<Suspense>`. The read is cached
 * (`getPublishedRelease()` uses `"use cache"`), but a cached function still
 * awaits, so it must sit behind a boundary instead of blocking the shell. The
 * `fallback` therefore shows only while the cached read resolves — on an
 * already-warm cache it is never seen.
 *
 * "Only published entries may be rendered" is enforced at the data boundary:
 * every section below derives from `getPublishedRelease()`, which reads the
 * `published_*` tables exclusively. Draft rows never reach this page.
 */
export default function PublicHome() {
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
        <Link
          href="/collection"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Explore the full collection
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      <Suspense fallback={<ShowcaseFallback />}>
        <PublishedShowcase />
      </Suspense>
    </main>
  );
}

/**
 * Resolves the published release and renders every data-driven section.
 *
 * Kept as its own component so the await happens *below* the page's Suspense
 * boundary, which is what lets the heading/copy above prerender. A `null`
 * release means "nothing published yet" — a normal state for a fresh
 * deployment — and each section renders its own empty state.
 */
async function PublishedShowcase() {
  const published = await loadPublishedRelease();
  const showcase = buildShowcaseModel(published);

  const accountStats = readAccountStats(published);
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

  // Published hero id → name, used to label the skin tab's hero association.
  const heroNames = Object.fromEntries(
    (published?.heroes ?? []).map((entry) => [entry.id, entry.name])
  );

  return (
    <>
      <div className="mx-auto max-w-4xl">
        {/* Spotlight header — cinematic header featuring the signature hero. */}
        <SpotlightHeader
          hero={spotlightHero}
          stats={spotlightStats}
          className="mt-8"
        />

        {/* Stats strip — account stats and collection completeness. */}
        <StatsStrip stats={stripStats} className="mt-8" />
      </div>

      {/* Showcase tabs and milestone timeline — only published entries render. */}
      <div className="mx-auto mt-16 max-w-6xl text-left">
        <ShowcaseTabs
          heroes={showcase.signatureHeroes}
          skins={showcase.topRaritySkins}
          achievements={showcase.recentAchievements}
          heroNames={heroNames}
        />
        <MilestoneTimeline entries={showcase.timelineEntries} className="mt-14" />
      </div>
    </>
  );
}

/** Reserved space while the published release resolves, to avoid layout shift. */
function ShowcaseFallback() {
  return (
    <div
      className="mx-auto mt-16 max-w-6xl"
      aria-hidden="true"
      aria-busy="true"
    >
      <div className="h-6 w-40 animate-pulse rounded bg-surface-raised" />
      <div className="mt-6 h-64 animate-pulse rounded-xl bg-surface-raised/60" />
    </div>
  );
}
