import type { PublishedHero, PublishedSkin } from "../content/contracts.ts";
import type { SkinVariant } from "../content/validation.ts";
import { formatCount, formatDate, formatEnumLabel } from "../showcase/showcase-model.ts";

/**
 * Quick view and comparison view-model (task 05-05).
 *
 * The public collection explorer gained two overlay surfaces in this task: a
 * **quick view** for a single published entry and a **two-item comparison**
 * with a *Skin View* and a *Hero Performance View* tab. Both render the same
 * kind of information, so the rules that decide *what a field means* live here,
 * once, as pure functions:
 *
 * - **Published data only.** Every function works on the
 *   {@link PublishedCollection} the server component resolved from
 *   `getPublishedRelease()`. Nothing here queries anything, so a draft row
 *   cannot reach a modal.
 * - **Nothing is invented.** A value that the published data does not hold is
 *   reported as `not-recorded`; a value that the *entity type* has no field
 *   for is reported as `not-applicable`. The two are deliberately different
 *   statements, and neither is ever replaced by a plausible-looking number.
 * - **Only NULL means "missing".** `heroes.mastery_level` and
 *   `heroes.total_matches` are `NOT NULL` with a `0` default, so `0` is a real
 *   recorded value and is shown as one (`0 matches`, `Not mastered · 0 / 100`).
 *   `heroes.win_rate`, `skins.series`, `skins.variant` and the acquisition
 *   columns are nullable and are the ones that degrade to "not recorded".
 * - **Derived values stay derived.** The mastery *grade* is a documented band
 *   over the recorded mastery score, and the score itself is always rendered
 *   next to the grade — the label never replaces the number.
 * - **Pure and locale-stable.** No I/O, no React, no `Intl` with a
 *   locale-dependent default, so the server render, the hydrated client render
 *   and the unit tests all agree byte for byte.
 */

/** Which kind of published entry a view describes. */
export type EntryKind = "hero" | "skin";

/**
 * How a detail value was resolved.
 *
 * - `recorded` — the published data holds this value.
 * - `not-recorded` — the column exists, but nothing was recorded for it.
 * - `not-applicable` — the entity type has no such attribute at all.
 */
export type DetailStatus = "recorded" | "not-recorded" | "not-applicable";

/** Copy shown in place of a value that is not available. */
export const DETAIL_STATUS_TEXT: Record<
  Exclude<DetailStatus, "recorded">,
  string
> = {
  "not-recorded": "Not recorded",
  "not-applicable": "Not applicable",
};

/**
 * One labelled field of a quick view or comparison column.
 *
 * `value` is `null` whenever `status` is not `recorded`, so a caller can never
 * render a placeholder next to a real value by accident.
 */
export interface DetailRow {
  /** Stable key — also the React key and the test assertion key. */
  key: string;
  /** Row label ("Rarity", "Win rate", …). */
  label: string;
  /** Display value, or `null` when `status` is not `recorded`. */
  value: string | null;
  status: DetailStatus;
  /** Machine-readable number for the row, when it has one. */
  numeric: number | null;
  /** ISO date so the value can be rendered inside a `<time>` element. */
  dateTime: string | null;
  /** Optional secondary line rendered under the value. */
  note: string | null;
}

/** The published slices the detail views read. */
export interface PublishedCollection {
  readonly heroes: readonly PublishedHero[];
  readonly skins: readonly PublishedSkin[];
}

/** A pointer to one published entry (a hero or a skin). */
export interface EntryRef {
  kind: EntryKind;
  id: string;
}

/** The tone of a chip shown above an entry. */
export type EntryBadgeTone =
  | "rarity"
  | "signature"
  | "favorite"
  | "owned"
  | "unowned";

/** A short chip shown above an entry (rarity, signature, ownership, …). */
export interface EntryBadge {
  key: string;
  label: string;
  tone: EntryBadgeTone;
  /** Rarity value — only present for `tone === "rarity"`. */
  rarity?: PublishedSkin["rarity"];
}

/**
 * Everything the overlays need to identify one entry: its artwork, its labels
 * and the hero behind it.
 */
export interface EntryDetails {
  kind: EntryKind;
  id: string;
  name: string;
  /**
   * Public slug of the entry.
   *
   * Used to build canonical public URLs (the share links of task `05-06`), so
   * a link keeps working after the display name changes.
   */
  slug: string;
  /** Artwork: the portrait for a hero, the splash art for a skin. */
  mediaId: string | null;
  /** Alt text for the artwork. */
  mediaAlt: string;
  /** Context line: the roles for a hero, the linked hero for a skin. */
  context: string | null;
  /** Chips rendered above the details. */
  badges: EntryBadge[];
  /** The hero behind the entry: the hero itself, or a skin's linked hero. */
  hero: PublishedHero | null;
}

// ---------------------------------------------------------------------------
// Comparison tabs and fields
// ---------------------------------------------------------------------------

/** The comparison tabs, in display order. */
export const COMPARISON_TABS = [
  {
    id: "skin",
    label: "Skin View",
    summary: "Splash art, rarity, series, painted variant, and acquisition.",
  },
  {
    id: "hero-performance",
    label: "Hero Performance View",
    summary:
      "Mastery, matches, win rate, primary role, and total skins owned.",
  },
] as const;

export type ComparisonTab = (typeof COMPARISON_TABS)[number]["id"];

/** A labelled field of a comparison table. */
export interface ComparisonField {
  key: string;
  label: string;
}

/**
 * The fields each tab compares, in display order.
 *
 * They are declared as data (not derived from the rows) so the table header,
 * the row labels and the row builders cannot drift apart, and so both columns
 * are guaranteed to be index-aligned.
 */
export const COMPARISON_FIELDS: Record<ComparisonTab, readonly ComparisonField[]> =
  {
    skin: [
      { key: "rarity", label: "Rarity" },
      { key: "series", label: "Series" },
      { key: "variant", label: "Variant" },
      { key: "acquisition", label: "Acquisition" },
    ],
    "hero-performance": [
      { key: "mastery", label: "Mastery" },
      { key: "matches", label: "Matches" },
      { key: "win-rate", label: "Win rate" },
      { key: "primary-role", label: "Primary role" },
      { key: "skins-owned", label: "Skins owned" },
    ],
  };

// ---------------------------------------------------------------------------
// Mastery grading
// ---------------------------------------------------------------------------

/** A documented band over the recorded mastery score. */
export interface MasteryGrade {
  /** Human label for the band. */
  label: string;
  /** The recorded score the label was derived from. */
  level: number;
}

/**
 * Mastery bands over the 0–100 `heroes.mastery_level` range.
 *
 * The score is always shown next to the band, so the label is a convenience
 * and never a replacement for the recorded number.
 */
export const MASTERY_GRADE_BANDS = [
  { min: 0, max: 0, label: "Not mastered" },
  { min: 1, max: 19, label: "Novice" },
  { min: 20, max: 39, label: "Apprentice" },
  { min: 40, max: 59, label: "Skilled" },
  { min: 60, max: 79, label: "Advanced" },
  { min: 80, max: 99, label: "Expert" },
  { min: 100, max: 100, label: "Master" },
] as const;

/**
 * Grades a recorded mastery score.
 *
 * Returns `null` for a score outside the schema's 0–100 range (or a
 * non-number), because an out-of-range value is not something to grade — it is
 * data that should be reported as missing rather than rounded into a band.
 */
export function masteryGrade(
  level: number | null | undefined
): MasteryGrade | null {
  if (
    level === null ||
    level === undefined ||
    typeof level !== "number" ||
    !Number.isFinite(level) ||
    level < 0 ||
    level > 100
  ) {
    return null;
  }
  const score = Math.round(level);
  const band =
    MASTERY_GRADE_BANDS.find(
      (candidate) => score >= candidate.min && score <= candidate.max
    ) ?? MASTERY_GRADE_BANDS[0];
  return { label: band.label, level: score };
}

/**
 * Formats a win rate as a percentage, or `null` when it was not recorded.
 *
 * `heroes.win_rate` is nullable on purpose: "not recorded" is a legitimate
 * state and must never be rendered as `0%`.
 */
export function formatWinRate(value: number | null | undefined): string | null {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }
  return `${value.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Collection counts
// ---------------------------------------------------------------------------

/** How many published skins are linked to a hero. */
export function countSkinsForHero(
  collection: PublishedCollection | null | undefined,
  heroId: string
): number {
  return (collection?.skins ?? []).filter((skin) => skin.heroId === heroId).length;
}

/** How many of a hero's published skins the account owns. */
export function countOwnedSkins(
  collection: PublishedCollection | null | undefined,
  heroId: string
): number {
  return (collection?.skins ?? []).filter(
    (skin) => skin.heroId === heroId && skin.isOwned
  ).length;
}

// ---------------------------------------------------------------------------
// Entry resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a reference to a published entry.
 *
 * Returns `null` when the reference points at something the release does not
 * contain (a stale link, a hand-edited URL) — the caller then renders nothing
 * rather than a half-populated modal.
 */
export function resolveEntry(
  collection: PublishedCollection | null | undefined,
  ref: EntryRef
): EntryDetails | null {
  const heroes = collection?.heroes ?? [];
  const skins = collection?.skins ?? [];

  if (ref.kind === "hero") {
    const hero = heroes.find((entry) => entry.id === ref.id);
    return hero ? heroDetails(hero) : null;
  }

  const skin = skins.find((entry) => entry.id === ref.id);
  return skin ? skinDetails(skin, heroes) : null;
}

/**
 * Resolves a list of references, dropping the ones the release does not
 * contain. Used to build the comparison columns.
 */
export function resolveComparisonEntries(
  collection: PublishedCollection | null | undefined,
  refs: readonly EntryRef[]
): EntryDetails[] {
  const resolved: EntryDetails[] = [];
  for (const ref of refs) {
    const entry = resolveEntry(collection, ref);
    if (entry !== null) {
      resolved.push(entry);
    }
  }
  return resolved;
}

/** Human role line for a hero (`"Tank / Support"`). */
export function heroRoleLine(hero: PublishedHero): string {
  return hero.secondaryRole
    ? `${formatEnumLabel(hero.primaryRole)} / ${formatEnumLabel(hero.secondaryRole)}`
    : formatEnumLabel(hero.primaryRole);
}

function heroDetails(hero: PublishedHero): EntryDetails {
  const badges: EntryBadge[] = [];
  if (hero.isSignature) {
    badges.push({ key: "signature", label: "Signature", tone: "signature" });
  }
  if (hero.isFavorite) {
    badges.push({ key: "favorite", label: "Favorite", tone: "favorite" });
  }
  return {
    kind: "hero",
    id: hero.id,
    name: hero.name,
    slug: hero.slug,
    mediaId: hero.portraitMediaId,
    mediaAlt: `Portrait of ${hero.name}`,
    context: heroRoleLine(hero),
    badges,
    hero,
  };
}

function skinDetails(
  skin: PublishedSkin,
  heroes: readonly PublishedHero[]
): EntryDetails {
  const hero =
    skin.heroId === null
      ? null
      : heroes.find((entry) => entry.id === skin.heroId) ?? null;

  const badges: EntryBadge[] = [
    {
      key: "rarity",
      label: formatEnumLabel(skin.rarity),
      tone: "rarity",
      rarity: skin.rarity,
    },
    {
      key: "ownership",
      label: skin.isOwned ? "Owned" : "Not owned",
      tone: skin.isOwned ? "owned" : "unowned",
    },
  ];
  if (skin.isFavorite) {
    badges.push({ key: "favorite", label: "Favorite", tone: "favorite" });
  }

  return {
    kind: "skin",
    id: skin.id,
    name: skin.name,
    slug: skin.slug,
    mediaId: skin.splashArtMediaId,
    mediaAlt: `${skin.name} splash art`,
    context: hero === null ? null : hero.name,
    badges,
    hero,
  };
}

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

const VARIANT_LABELS: Record<SkinVariant, string> = {
  model: "Model",
  painted: "Painted",
  other: "Other",
};

function recordedRow(
  key: string,
  label: string,
  value: string,
  extra: Partial<Omit<DetailRow, "key" | "label" | "value" | "status">> = {}
): DetailRow {
  return {
    key,
    label,
    value,
    status: "recorded",
    numeric: null,
    dateTime: null,
    note: null,
    ...extra,
  };
}

function missingRow(
  key: string,
  label: string,
  status: Exclude<DetailStatus, "recorded">,
  note: string | null = null
): DetailRow {
  return { key, label, value: null, status, numeric: null, dateTime: null, note };
}

/**
 * The *Skin View* rows for one entry.
 *
 * A hero has no skin attributes at all, so those rows are `not-applicable`
 * rather than `not-recorded` — a hero is not a skin whose rarity happens to be
 * missing.
 */
export function buildSkinRows(
  collection: PublishedCollection | null | undefined,
  entry: EntryDetails
): DetailRow[] {
  if (entry.kind === "hero") {
    const note = "Hero entries have no skin attributes.";
    return COMPARISON_FIELDS.skin.map((field) =>
      missingRow(field.key, field.label, "not-applicable", note)
    );
  }

  const skin = (collection?.skins ?? []).find((item) => item.id === entry.id);
  if (!skin) {
    const note = "This skin is not part of the published release.";
    return COMPARISON_FIELDS.skin.map((field) =>
      missingRow(field.key, field.label, "not-recorded", note)
    );
  }

  return [
    rarityRow(skin),
    seriesRow(skin),
    variantRow(skin),
    acquisitionRow(skin),
  ];
}

/**
 * The *Hero Performance View* rows for one entry.
 *
 * A skin is graded through the hero it belongs to; a skin with no linked hero
 * has no performance data at all, and every row says so instead of guessing.
 */
export function buildPerformanceRows(
  collection: PublishedCollection | null | undefined,
  entry: EntryDetails
): DetailRow[] {
  const hero = entry.hero;
  if (hero === null) {
    const note =
      entry.kind === "skin"
        ? "This skin is not linked to a hero."
        : "No hero data is available.";
    return COMPARISON_FIELDS["hero-performance"].map((field) =>
      missingRow(field.key, field.label, "not-recorded", note)
    );
  }

  return [
    masteryRow(hero),
    matchesRow(hero),
    winRateRow(hero),
    primaryRoleRow(hero),
    skinsOwnedRow(collection, hero),
  ];
}

function rarityRow(skin: PublishedSkin): DetailRow {
  return recordedRow("rarity", "Rarity", formatEnumLabel(skin.rarity));
}

function seriesRow(skin: PublishedSkin): DetailRow {
  const series = skin.series?.trim() ?? "";
  return series === ""
    ? missingRow("series", "Series", "not-recorded")
    : recordedRow("series", "Series", series);
}

function variantRow(skin: PublishedSkin): DetailRow {
  const variant = skin.variant;
  if (variant === null || variant === undefined) {
    return missingRow("variant", "Variant", "not-recorded");
  }
  const label = Object.prototype.hasOwnProperty.call(VARIANT_LABELS, variant)
    ? VARIANT_LABELS[variant]
    : formatEnumLabel(variant);
  return recordedRow("variant", "Variant", label);
}

function acquisitionRow(skin: PublishedSkin): DetailRow {
  const date = formatDate(skin.acquisitionDate);
  const milestone = skin.acquisitionMilestone?.trim() ?? "";

  if (date !== null) {
    return recordedRow("acquisition", "Acquisition", date, {
      dateTime: skin.acquisitionDate,
      note: milestone === "" ? null : `Milestone: ${milestone}`,
    });
  }
  if (milestone !== "") {
    return recordedRow("acquisition", "Acquisition", milestone, {
      note: "Recorded as a milestone",
    });
  }
  return missingRow("acquisition", "Acquisition", "not-recorded");
}

function masteryRow(hero: PublishedHero): DetailRow {
  const grade = masteryGrade(hero.masteryLevel);
  if (grade === null) {
    return missingRow("mastery", "Mastery", "not-recorded");
  }
  return recordedRow("mastery", "Mastery", grade.label, {
    numeric: grade.level,
    note: `${formatCount(grade.level)} / 100`,
  });
}

function matchesRow(hero: PublishedHero): DetailRow {
  return recordedRow("matches", "Matches", formatCount(hero.totalMatches), {
    numeric: hero.totalMatches,
  });
}

function winRateRow(hero: PublishedHero): DetailRow {
  const value = formatWinRate(hero.winRate);
  if (value === null) {
    return missingRow("win-rate", "Win rate", "not-recorded");
  }
  return recordedRow("win-rate", "Win rate", value, { numeric: hero.winRate });
}

function primaryRoleRow(hero: PublishedHero): DetailRow {
  return recordedRow(
    "primary-role",
    "Primary role",
    formatEnumLabel(hero.primaryRole),
    {
      note: hero.secondaryRole
        ? `Secondary: ${formatEnumLabel(hero.secondaryRole)}`
        : null,
    }
  );
}

function skinsOwnedRow(
  collection: PublishedCollection | null | undefined,
  hero: PublishedHero
): DetailRow {
  const owned = countOwnedSkins(collection, hero.id);
  const total = countSkinsForHero(collection, hero.id);
  return recordedRow("skins-owned", "Skins owned", formatCount(owned), {
    numeric: owned,
    note:
      total === 0
        ? "No published skins for this hero"
        : `of ${formatCount(total)} published`,
  });
}

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

/** One labelled block of the quick view. */
export interface QuickViewSection {
  id: string;
  title: string;
  rows: DetailRow[];
  /** Shown instead of the rows when there is nothing to show. */
  emptyMessage: string | null;
}

/** Everything the quick view renders for one entry. */
export interface QuickViewModel {
  entry: EntryDetails;
  sections: QuickViewSection[];
}

/**
 * Builds the quick view for one entry.
 *
 * A hero shows its performance; a skin shows its skin details and — when it
 * is linked to a hero — that hero's performance.
 */
export function buildQuickViewModel(
  collection: PublishedCollection | null | undefined,
  entry: EntryDetails
): QuickViewModel {
  if (entry.kind === "hero") {
    return {
      entry,
      sections: [
        {
          id: "performance",
          title: "Hero performance",
          rows: buildPerformanceRows(collection, entry),
          emptyMessage: null,
        },
      ],
    };
  }

  return {
    entry,
    sections: [
      {
        id: "skin-details",
        title: "Skin details",
        rows: buildSkinRows(collection, entry),
        emptyMessage: null,
      },
      {
        id: "performance",
        title: "Hero performance",
        rows: buildPerformanceRows(collection, entry),
        emptyMessage:
          entry.hero === null
            ? "This skin is not linked to a hero, so no performance data is available."
            : null,
      },
    ],
  };
}

/** One compared entry and its rows. */
export interface ComparisonColumn {
  entry: EntryDetails;
  /** Rows, index-aligned with `COMPARISON_FIELDS[tab]`. */
  rows: DetailRow[];
}

/** Everything the comparison modal renders for one tab. */
export interface ComparisonModel {
  tab: ComparisonTab;
  fields: readonly ComparisonField[];
  columns: ComparisonColumn[];
}

/**
 * Builds the comparison model for one tab.
 *
 * Both columns share the same field list, so the table rows line up whatever
 * the two entries are — two skins, two heroes, or one of each.
 */
export function buildComparisonModel(
  collection: PublishedCollection | null | undefined,
  entries: readonly EntryDetails[],
  tab: ComparisonTab
): ComparisonModel {
  const fields = COMPARISON_FIELDS[tab];
  return {
    tab,
    fields,
    columns: entries.map((entry) => ({
      entry,
      rows:
        tab === "skin"
          ? buildSkinRows(collection, entry)
          : buildPerformanceRows(collection, entry),
    })),
  };
}
