"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type {
  PublishedAchievement,
  PublishedHero,
  PublishedSkin,
} from "@/app/lib/content/contracts";
import { rarityToken } from "@/app/lib/showcase/rarity-tokens";
import {
  formatCount,
  formatDate,
  formatEnumLabel,
  initialsFromName,
  resolveTabKeyIndex,
  SHOWCASE_TABS,
  type ShowcaseTabId,
} from "@/app/lib/showcase/showcase-model";

/**
 * Showcase tabs (task 05-03) — signature heroes, top-tier skins, and recent
 * achievements from the *published* release only.
 *
 * Accessibility notes:
 * - Follows the WAI-ARIA tabs pattern: `role="tablist"` / `role="tab"` /
 *   `role="tabpanel"`, `aria-selected`, `aria-controls`, and a roving
 *   `tabIndex` so the tablist is a single tab stop.
 * - ArrowRight/ArrowLeft wrap, Home/End jump to the first/last tab, and
 *   selection follows focus (automatic activation, appropriate here because
 *   switching tabs only reveals already-rendered content).
 * - Each panel is an explicitly labelled region; empty sections render a
 *   plain-text empty state rather than an empty grid.
 *
 * The component receives pre-resolved published data from its parent Server
 * Component. It never imports the content service, so it cannot read drafts.
 */
export interface ShowcaseTabsProps {
  /** Published heroes flagged as signature (see `buildShowcaseModel`). */
  heroes: PublishedHero[];
  /** Published Collector/Legend/Epic skins (see `buildShowcaseModel`). */
  skins: PublishedSkin[];
  /** Most recent published achievements (see `buildShowcaseModel`). */
  achievements: PublishedAchievement[];
  /** Published hero id → name, used to label the skin's hero association. */
  heroNames?: Record<string, string>;
  className?: string;
}

export function ShowcaseTabs({
  heroes,
  skins,
  achievements,
  heroNames = {},
  className = "",
}: ShowcaseTabsProps) {
  const [activeId, setActiveId] = useState<ShowcaseTabId>(SHOWCASE_TABS[0].id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // `useId` keeps tab/panel ids unique if the section is ever rendered twice;
  // sanitized so the ids are safe in `aria-controls`.
  const idPrefix = `showcase-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const counts: Record<ShowcaseTabId, number> = {
    "signature-heroes": heroes.length,
    "top-rarity-skins": skins.length,
    "recent-achievements": achievements.length,
  };
  const activeIndex = Math.max(
    0,
    SHOWCASE_TABS.findIndex((tab) => tab.id === activeId)
  );

  const tabDomId = (id: ShowcaseTabId) => `${idPrefix}-${id}-tab`;
  const panelDomId = (id: ShowcaseTabId) => `${idPrefix}-${id}-panel`;

  function selectTab(index: number) {
    const tab = SHOWCASE_TABS[index];
    if (!tab) {
      return;
    }
    setActiveId(tab.id);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nextIndex = resolveTabKeyIndex(
      event.key,
      activeIndex,
      SHOWCASE_TABS.length
    );
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    selectTab(nextIndex);
  }

  return (
    <section
      aria-labelledby={`${idPrefix}-heading`}
      className={className}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Showcase</p>
      <h2
        id={`${idPrefix}-heading`}
        className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground"
      >
        Collection highlights
      </h2>

      <div
        role="tablist"
        aria-label="Collection highlights"
        onKeyDown={handleKeyDown}
        className="mt-6 flex flex-wrap gap-2"
      >
        {SHOWCASE_TABS.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabDomId(tab.id)}
              aria-selected={selected}
              aria-controls={panelDomId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(index)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {tab.label}
              <span
                aria-hidden="true"
                className="rounded-full bg-surface-raised px-2 py-0.5 font-mono text-xs tabular-nums text-muted"
              >
                {counts[tab.id]}
              </span>
              <span className="sr-only">{` — ${counts[tab.id]} ${
                counts[tab.id] === 1 ? "entry" : "entries"
              }`}</span>
            </button>
          );
        })}
      </div>

      {SHOWCASE_TABS.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelDomId(tab.id)}
            aria-labelledby={tabDomId(tab.id)}
            tabIndex={0}
            hidden={!selected}
            className="mt-6"
          >
            {tab.id === "signature-heroes" &&
              (heroes.length > 0 ? (
                <ul className="grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {heroes.map((hero) => (
                    <li key={hero.id}>
                      <HeroCard hero={hero} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message={tab.emptyMessage} />
              ))}

            {tab.id === "top-rarity-skins" &&
              (skins.length > 0 ? (
                <ul className="grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {skins.map((skin) => (
                    <li key={skin.id}>
                      <SkinCard
                        skin={skin}
                        heroName={
                          skin.heroId ? heroNames[skin.heroId] : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message={tab.emptyMessage} />
              ))}

            {tab.id === "recent-achievements" &&
              (achievements.length > 0 ? (
                <ul className="grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {achievements.map((achievement) => (
                    <li key={achievement.id}>
                      <AchievementCard achievement={achievement} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message={tab.emptyMessage} />
              ))}
          </div>
        );
      })}
    </section>
  );
}

function HeroCard({ hero }: { hero: PublishedHero }) {
  const roles = hero.secondaryRole
    ? `${formatEnumLabel(hero.primaryRole)} / ${formatEnumLabel(
        hero.secondaryRole
      )}`
    : formatEnumLabel(hero.primaryRole);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised/60">
      <MediaFrame
        mediaId={hero.portraitMediaId}
        alt={`Portrait of ${hero.name}`}
        name={hero.name}
        className="aspect-[4/5]"
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-foreground">
            {hero.name}
          </h3>
          <span className="shrink-0 rounded-full border border-accent-gold/50 bg-accent-gold-soft px-2 py-0.5 text-xs text-accent-gold-text">
            Signature
          </span>
        </div>

        <p className="text-xs uppercase tracking-wider text-muted">{roles}</p>

        {hero.specialty ? (
          <p className="line-clamp-2 text-sm text-muted">{hero.specialty}</p>
        ) : null}

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
          <div>
            <dt className="text-xs text-muted">Mastery</dt>
            <dd className="font-mono text-sm tabular-nums text-foreground">
              {formatCount(hero.masteryLevel)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Matches</dt>
            <dd className="font-mono text-sm tabular-nums text-foreground">
              {formatCount(hero.totalMatches)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Win rate</dt>
            <dd className="font-mono text-sm tabular-nums text-foreground">
              {hero.winRate === null ? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Not recorded</span>
                </>
              ) : (
                `${hero.winRate.toFixed(1)}%`
              )}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function SkinCard({
  skin,
  heroName,
}: {
  skin: PublishedSkin;
  heroName?: string;
}) {
  const token = rarityToken(skin.rarity);
  const acquiredOn = formatDate(skin.acquisitionDate);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised/60">
      <MediaFrame
        mediaId={skin.splashArtMediaId}
        alt={`${skin.name} splash art`}
        name={skin.name}
        className="aspect-[16/10]"
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-foreground">
            {skin.name}
          </h3>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${token.chipClass}`}
          >
            {token.label}
          </span>
        </div>

        <p className="text-xs uppercase tracking-wider text-muted">
          {heroName ?? "Hero not linked"}
        </p>

        {skin.series ? (
          <p className="text-sm text-muted">{skin.series}</p>
        ) : null}

        <p className="mt-auto text-xs text-muted">
          {acquiredOn ? (
            <>
              Acquired{" "}
              <time dateTime={skin.acquisitionDate ?? undefined}>
                {acquiredOn}
              </time>
            </>
          ) : skin.acquisitionMilestone ? (
            `Milestone: ${skin.acquisitionMilestone}`
          ) : (
            "Acquisition not recorded"
          )}
        </p>
      </div>
    </article>
  );
}

function AchievementCard({
  achievement,
}: {
  achievement: PublishedAchievement;
}) {
  const earnedOn = formatDate(achievement.earnedOn);

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-xs uppercase tracking-wider text-muted">
          {formatEnumLabel(achievement.category)}
        </span>
        {earnedOn ? (
          <time
            dateTime={achievement.earnedOn ?? undefined}
            className="font-mono text-xs tabular-nums text-muted"
          >
            {earnedOn}
          </time>
        ) : (
          <span className="text-xs text-muted">Date not recorded</span>
        )}
      </div>

      <h3 className="font-display text-lg font-semibold text-foreground">
        {achievement.title}
      </h3>

      {achievement.description ? (
        <p className="text-sm text-muted">{achievement.description}</p>
      ) : null}
    </article>
  );
}

function MediaFrame({
  mediaId,
  alt,
  name,
  className,
}: {
  mediaId: string | null;
  alt: string;
  name: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(mediaId) && !failed;

  return (
    <div className={`relative w-full overflow-hidden bg-surface ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- published media is resolved from the release at runtime, so there is no statically analysable asset to hand to next/image
        <img
          src={`/showcase-public/${mediaId}.png`}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-raised via-surface to-background">
          <span
            aria-hidden="true"
            className="font-display text-3xl font-semibold text-muted/70"
          >
            {initialsFromName(name)}
          </span>
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border bg-surface/60 p-6 text-sm text-muted">
      {message}
    </p>
  );
}
