import type { PublishedTimelineEntry } from "@/app/lib/content/contracts";
import {
  formatDate,
  formatEnumLabel,
} from "@/app/lib/showcase/showcase-model";

/**
 * Milestone timeline (task 05-03).
 *
 * Renders the published timeline entries newest first, with entries flagged
 * `isHighlight` visually promoted (gold marker + badge). It is intentionally a
 * server component: the timeline has no interaction, so it ships no JavaScript.
 *
 * Every entry comes from the published release snapshot — the public page never
 * reads draft timeline rows.
 */
export interface MilestoneTimelineProps {
  /** Published timeline entries (see `buildShowcaseModel`). */
  entries: PublishedTimelineEntry[];
  className?: string;
}

export function MilestoneTimeline({
  entries,
  className = "",
}: MilestoneTimelineProps) {
  return (
    <section
      className={className}
      aria-labelledby="milestone-timeline-heading"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Journey</p>
      <h2
        id="milestone-timeline-heading"
        className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground"
      >
        Milestones
      </h2>

      {entries.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border bg-surface/60 p-6 text-sm text-muted">
          No milestones have been published yet.
        </p>
      ) : (
        <ol role="list" className="mt-6 border-l border-border">
          {entries.map((entry) => {
            const occurredOn = formatDate(entry.occurredOn);

            return (
              <li key={entry.id} className="relative pb-6 pl-6 last:pb-0">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-1.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 ${
                    entry.isHighlight
                      ? "border-accent-gold bg-accent-gold"
                      : "border-border-strong bg-background"
                  }`}
                />

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <time
                    dateTime={entry.occurredOn}
                    className="font-mono text-xs tabular-nums text-muted"
                  >
                    {occurredOn ?? entry.occurredOn}
                  </time>
                  <span className="text-xs uppercase tracking-wider text-muted/70">
                    {formatEnumLabel(entry.kind)}
                  </span>
                  {entry.isHighlight ? (
                    <span className="rounded-full border border-accent-gold/50 bg-accent-gold-soft px-2 py-0.5 text-xs text-accent-gold-text">
                      Highlight
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
                  {entry.title}
                </h3>

                {entry.body ? (
                  <p className="mt-1 max-w-2xl text-sm text-muted">
                    {entry.body}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
