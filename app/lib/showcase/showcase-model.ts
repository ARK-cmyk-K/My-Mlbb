import type {
  PublishedAchievement,
  PublishedHero,
  PublishedRelease,
  PublishedSkin,
  PublishedTimelineEntry,
} from "../content/contracts.ts";
import { SKIN_RARITIES, type SkinRarity } from "../content/validation.ts";

/**
 * Pure view-model derivation for the public showcase (task 05-03).
 *
 * The showcase tabs and the milestone timeline render *only* from the
 * {@link PublishedRelease} snapshot returned by the content-service port
 * (`getPublishedRelease()`): draft rows never reach this module, so "only
 * published entries may be rendered" is enforced by the data boundary rather
 * than by a filter an exception could bypass.
 *
 * Everything here is pure (no I/O, no React) so the selection/ordering rules
 * are unit-testable without a DOM. The components own presentation only.
 */

/** Stable tab ids; also used to derive the tab/panel DOM ids. */
export const SHOWCASE_TAB_IDS = [
  "signature-heroes",
  "top-rarity-skins",
  "recent-achievements",
] as const;

export type ShowcaseTabId = (typeof SHOWCASE_TAB_IDS)[number];

export interface ShowcaseTabDefinition {
  id: ShowcaseTabId;
  /** Short label shown on the tab. */
  label: string;
  /** Copy shown when the published release has no entries for this tab. */
  emptyMessage: string;
}

/** Tabs in display order. Defined as data so the tablist and panels can't drift. */
export const SHOWCASE_TABS: readonly ShowcaseTabDefinition[] = [
  {
    id: "signature-heroes",
    label: "Signature heroes",
    emptyMessage: "No signature heroes are published in this release yet.",
  },
  {
    id: "top-rarity-skins",
    label: "Top-tier skins",
    emptyMessage:
      "No Collector, Legend, or Epic skins are published in this release yet.",
  },
  {
    id: "recent-achievements",
    label: "Recent achievements",
    emptyMessage: "No achievements are published in this release yet.",
  },
];

/**
 * Rarities the skin tab treats as top-tier (highest first). Collector and
 * Legend are the headline tiers; Epic is included as the next band up so a
 * collection without either headline tier still shows its best skins.
 */
export const HIGH_RARITY_SKINS: readonly SkinRarity[] = [
  "collector",
  "legend",
  "epic",
];

/** The tab shows the most recent achievements only; the rest stay in the dashboard. */
export const RECENT_ACHIEVEMENT_LIMIT = 6;

export interface ShowcaseModel {
  /** Published heroes flagged `isSignature`, best mastery first. */
  signatureHeroes: PublishedHero[];
  /** Published Collector/Legend/Epic skins, highest rarity first. */
  topRaritySkins: PublishedSkin[];
  /** Most recently earned published achievements (undated entries last). */
  recentAchievements: PublishedAchievement[];
  /** Published timeline entries, newest first (highlights flagged). */
  timelineEntries: PublishedTimelineEntry[];
}

/** Returns true when a skin belongs in the top-tier tab. */
export function isHighRaritySkin(rarity: SkinRarity): boolean {
  return HIGH_RARITY_SKINS.includes(rarity);
}

/**
 * Derives every showcase section from one published release.
 *
 * Missing or unpublished data yields empty arrays (the components render
 * explicit empty states), never placeholder content or invented entries.
 * Input arrays are not mutated.
 */
export function buildShowcaseModel(
  release: PublishedRelease | null | undefined
): ShowcaseModel {
  const heroes = release?.heroes ?? [];
  const skins = release?.skins ?? [];
  const achievements = release?.achievements ?? [];
  const timelineEntries = release?.timelineEntries ?? [];

  return {
    signatureHeroes: heroes
      .filter((hero) => hero.isSignature)
      .sort(
        (a, b) =>
          b.masteryLevel - a.masteryLevel ||
          b.totalMatches - a.totalMatches ||
          compareText(a.name, b.name)
      ),
    topRaritySkins: skins
      .filter((skin) => isHighRaritySkin(skin.rarity))
      .sort(
        (a, b) =>
          rarityRank(b.rarity) - rarityRank(a.rarity) ||
          compareDateDesc(a.acquisitionDate, b.acquisitionDate) ||
          compareText(a.name, b.name)
      ),
    recentAchievements: achievements
      .slice()
      .sort(
        (a, b) =>
          compareDateDesc(a.earnedOn, b.earnedOn) ||
          compareText(a.title, b.title)
      )
      .slice(0, RECENT_ACHIEVEMENT_LIMIT),
    timelineEntries: timelineEntries
      .slice()
      .sort(
        (a, b) =>
          compareDateDesc(a.occurredOn, b.occurredOn) ||
          compareText(a.title, b.title)
      ),
  };
}

/**
 * Maps a tablist key press to the next tab index (WAI-ARIA tabs pattern).
 *
 * Returns `null` for keys the tablist should ignore, including any key when
 * there are no tabs. Arrow keys wrap; Home/End jump to the first/last tab.
 */
export function resolveTabKeyIndex(
  key: string,
  currentIndex: number,
  tabCount: number
): number | null {
  if (tabCount <= 0) {
    return null;
  }
  const current =
    currentIndex >= 0 && currentIndex < tabCount ? currentIndex : 0;

  switch (key) {
    case "ArrowRight":
      return (current + 1) % tabCount;
    case "ArrowLeft":
      return (current - 1 + tabCount) % tabCount;
    case "Home":
      return 0;
    case "End":
      return tabCount - 1;
    default:
      return null;
  }
}

/** Human label for an enum-ish value (`"starlight"` → `"Starlight"`). */
export function formatEnumLabel(value: string): string {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Placeholder initials for missing artwork (`"Yi Sun-shin"` → `"YS"`). */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) {
    return "?";
  }
  return words.map((word) => word.charAt(0).toUpperCase()).join("");
}

const COUNT_FORMATTER = new Intl.NumberFormat("en-US");

/** Locale-stable number formatting (no hydration drift between server/client). */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? COUNT_FORMATTER.format(value) : "—";
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * Locale/time-zone-stable date formatting for date-only columns.
 *
 * Fixed locale + UTC keeps the server markup and the hydrated client markup
 * identical (a locale-dependent date would otherwise cause hydration drift).
 * Returns `null` for missing or unparseable values so callers can degrade.
 */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return DATE_FORMATTER.format(date);
}

function rarityRank(rarity: SkinRarity): number {
  return SKIN_RARITIES.indexOf(rarity);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Newest first; missing dates sort last instead of pretending to be old. */
function compareDateDesc(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const left = a ?? null;
  const right = b ?? null;
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return right.localeCompare(left);
}
