import Link from "next/link";
import type { ReactNode } from "react";

import type { PublishedHero, PublishedSkin } from "@/app/lib/content/contracts";
import { MediaFrame } from "@/app/components/media-frame";
import { rarityToken } from "@/app/lib/showcase/rarity-tokens";
import {
  formatCount,
  formatDate,
  formatEnumLabel,
} from "@/app/lib/showcase/showcase-model";

/**
 * Presentational pieces of the collection explorer (task 05-04).
 *
 * These components render only the published entries they are handed — they
 * fetch nothing and hold no state (except the shared `MediaFrame` image
 * fallback), so the server render and the hydrated client render are
 * identical. They are intentionally plain so the later quick-view/comparison
 * task (`05-05`) can reuse them inside its modals without dragging in the
 * explorer's filter state.
 *
 * Missing values are always shown as "not recorded" style copy, never filled in
 * with invented numbers.
 */

const CHIP_BASE = "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium";

const ACTION_BUTTON =
  "inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-border-strong";

/**
 * The optional overlay actions a card can offer (task 05-05).
 *
 * The cards stay presentational: they render the buttons and report the
 * clicks, but the explorer owns the state that decides which modal opens.
 */
export interface ExplorerCardActions {
  /** Opens the quick view for this entry. */
  onQuickView?: () => void;
  /** Adds this entry to the comparison tray, or removes it when it is there. */
  onCompare?: () => void;
  /** True when this entry is already in the comparison tray. */
  compareSelected?: boolean;
}

/** Signature chip — identical treatment to the showcase tabs (`05-03`). */
function SignatureChip() {
  return (
    <span className={`${CHIP_BASE} border-accent-gold/50 bg-accent-gold-soft text-accent-gold-text`}>
      Signature
    </span>
  );
}

/** Owner-favourite chip (the account's flag, not a visitor preference). */
function FavoriteChip() {
  return (
    <span className={`${CHIP_BASE} border-primary/50 bg-primary/10 text-primary`}>
      Favorite
    </span>
  );
}

export function ExplorerHeroCard({
  hero,
  actions,
}: {
  hero: PublishedHero;
  actions?: ExplorerCardActions;
}) {
  const roles = hero.secondaryRole
    ? `${formatEnumLabel(hero.primaryRole)} / ${formatEnumLabel(hero.secondaryRole)}`
    : formatEnumLabel(hero.primaryRole);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised/60 transition-colors hover:border-border-strong">
      <MediaFrame
        mediaId={hero.portraitMediaId}
        alt={`Portrait of ${hero.name}`}
        name={hero.name}
        className="aspect-[4/5]"
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-foreground">
            {hero.name}
          </h3>
          {hero.isSignature ? <SignatureChip /> : null}
        </div>

        <p className="text-xs uppercase tracking-wider text-muted">{roles}</p>

        {hero.specialty ? (
          <p className="line-clamp-2 text-sm text-muted">{hero.specialty}</p>
        ) : null}

        {hero.isFavorite ? (
          <p>
            <FavoriteChip />
          </p>
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

        {actions ? <CardActions actions={actions} name={hero.name} /> : null}
      </div>
    </article>
  );
}

export function ExplorerSkinCard({
  skin,
  heroName,
  actions,
}: {
  skin: PublishedSkin;
  heroName?: string;
  actions?: ExplorerCardActions;
}) {
  const token = rarityToken(skin.rarity);
  const acquiredOn = formatDate(skin.acquisitionDate);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised/60 transition-colors hover:border-border-strong">
      <MediaFrame
        mediaId={skin.splashArtMediaId}
        alt={`${skin.name} splash art`}
        name={skin.name}
        className="aspect-[16/10]"
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-foreground">
            {skin.name}
          </h3>
          <span className={`${CHIP_BASE} ${token.chipClass}`}>
            {token.label}
          </span>
        </div>

        <p className="text-xs uppercase tracking-wider text-muted">
          {heroName ?? "Hero not linked"}
        </p>

        {skin.series ? (
          <p className="text-sm text-muted">{skin.series}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <span
            className={`${CHIP_BASE} ${
              skin.isOwned
                ? "border-accent-emerald/50 bg-accent-emerald-soft text-accent-emerald-text"
                : "border-border bg-surface text-muted"
            }`}
          >
            {skin.isOwned ? "Owned" : "Not owned"}
          </span>
          {skin.isFavorite ? <FavoriteChip /> : null}
        </div>

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

        {actions ? <CardActions actions={actions} name={skin.name} /> : null}
      </div>
    </article>
  );
}

/**
 * The quick view / compare buttons at the foot of a card.
 *
 * The compare button is a toggle (`aria-pressed`), so its state is announced
 * rather than only implied by the label.
 */
function CardActions({
  actions,
  name,
}: {
  actions: ExplorerCardActions;
  name: string;
}) {
  if (!actions.onQuickView && !actions.onCompare) {
    return null;
  }

  const selected = actions.compareSelected === true;

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
      {actions.onQuickView ? (
        <button
          type="button"
          onClick={actions.onQuickView}
          className={ACTION_BUTTON}
        >
          Quick view
          <span className="sr-only">{` — ${name}`}</span>
        </button>
      ) : null}
      {actions.onCompare ? (
        <button
          type="button"
          onClick={actions.onCompare}
          aria-pressed={selected}
          className={`${ACTION_BUTTON} ${
            selected ? "border-primary bg-primary/10 text-primary" : ""
          }`}
        >
          {selected ? "In comparison" : "Compare"}
          <span className="sr-only">{` — ${name}`}</span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * A static informational panel (nothing published / the store could not be
 * reached). The optional action is a real link, so the panel still offers a way
 * forward without JavaScript.
 */
export function ExplorerNotice({
  title,
  body,
  action,
  children,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-surface/60 p-8">
      <h2 className="font-display text-xl font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted">{body}</p>
      {children}
      {action ? (
        <p className="mt-4">
          <Link
            href={action.href}
            className="inline-flex rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
          >
            {action.label}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/**
 * The "nothing matches" state inside the explorer.
 *
 * The action is always a real link (so it works without JavaScript); when the
 * parent already owns the state change, `onClick` intercepts the navigation and
 * applies it instantly instead.
 */
export function ExplorerEmptyState({
  message,
  action,
}: {
  message: string;
  action?: {
    label: string;
    href: string;
    onClick?: () => void;
  };
}) {
  return (
    <p className="rounded-xl border border-dashed border-border bg-surface/60 p-6 text-sm text-muted">
      {message}
      {action ? (
        <>
          {" "}
          <Link
            href={action.href}
            onClick={
              action.onClick
                ? (event) => {
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
                    action.onClick?.();
                  }
                : undefined
            }
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {action.label}
          </Link>
        </>
      ) : null}
    </p>
  );
}
