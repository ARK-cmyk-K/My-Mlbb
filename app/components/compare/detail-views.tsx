import { rarityToken } from "@/app/lib/showcase/rarity-tokens";
import {
  DETAIL_STATUS_TEXT,
  type DetailRow,
  type EntryBadge,
  type EntryDetails,
} from "@/app/lib/compare/compare-model";

/**
 * Shared presentation pieces for the quick view and the comparison modal
 * (task 05-05).
 *
 * These are plain presentational components: no state, no effects, no data
 * access. They render whatever the pure model in
 * `app/lib/compare/compare-model.ts` produced, which is what keeps the
 * "never fabricate a missing value" rule in one testable place.
 *
 * Only semantic design tokens are used, so both themes stay correct.
 */

/** Chips shown above an entry (rarity, signature, ownership, favorite). */
export function EntryBadges({ badges }: { badges: readonly EntryBadge[] }) {
  if (badges.length === 0) {
    return null;
  }

  return (
    <ul role="list" className="flex flex-wrap gap-2">
      {badges.map((badge) => (
        <li key={badge.key}>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClassName(badge)}`}
          >
            {badge.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function badgeClassName(badge: EntryBadge): string {
  switch (badge.tone) {
    case "rarity":
      return badge.rarity
        ? rarityToken(badge.rarity).chipClass
        : "border-border bg-surface text-muted";
    case "signature":
      return "border-accent-gold/50 bg-accent-gold-soft text-accent-gold-text";
    case "favorite":
      return "border-primary/50 bg-primary/10 text-primary";
    case "owned":
      return "border-accent-emerald/50 bg-accent-emerald-soft text-accent-emerald-text";
    case "unowned":
    default:
      return "border-border bg-surface text-muted";
  }
}

/** The name and context line of an entry. */
export function EntryIdentity({
  entry,
  headingLevel = 2,
  id,
}: {
  entry: EntryDetails;
  /** Heading level, so the quick view (h2) and the comparison (h3) both fit. */
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <div className="min-w-0">
      <Heading
        id={id}
        className="truncate font-display text-lg font-semibold text-foreground"
      >
        {entry.name}
      </Heading>
      {entry.context ? (
        <p className="mt-0.5 truncate text-xs uppercase tracking-wider text-muted">
          {entry.context}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A list of detail rows.
 *
 * A value that is not available renders as an em dash with the reason
 * available to assistive technology ("Not recorded" / "Not applicable") — the
 * missing value is never filled in with a plausible number.
 */
export function DetailRowList({ rows }: { rows: readonly DetailRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <dl className="divide-y divide-border/60">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
        >
          <dt className="text-xs uppercase tracking-wider text-muted">
            {row.label}
          </dt>
          <dd className="text-right text-sm text-foreground">
            <DetailValue row={row} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One detail value, with its status and optional note. */
export function DetailValue({ row }: { row: DetailRow }) {
  const unavailable = row.status !== "recorded" || row.value === null;
  if (unavailable) {
    const reason =
      row.status === "recorded"
        ? DETAIL_STATUS_TEXT["not-recorded"]
        : DETAIL_STATUS_TEXT[row.status];
    return (
      <span>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{reason}</span>
        {row.note ? (
          <span className="mt-0.5 block text-xs text-muted">{row.note}</span>
        ) : null}
      </span>
    );
  }

  return (
    <span>
      {row.dateTime ? (
        <time dateTime={row.dateTime}>{row.value}</time>
      ) : (
        row.value
      )}
      {row.note ? (
        <span className="mt-0.5 block text-xs text-muted">{row.note}</span>
      ) : null}
    </span>
  );
}
