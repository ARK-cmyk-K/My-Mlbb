import type { ReactNode } from "react";

export interface PlaceholderPanelProps {
  title: string;
  description: string;
  /** Task id(s) that will implement the real feature. */
  task: string;
  /** What the finished section will do, one bullet each. */
  points: string[];
  children?: ReactNode;
}

/**
 * Shared placeholder for dashboard sections that have no implementation yet
 * (task 02-02). It states plainly that nothing is wired up, so it never implies
 * a backend action succeeded.
 */
export function PlaceholderPanel({
  title,
  description,
  task,
  points,
  children,
}: PlaceholderPanelProps) {
  return (
    <section className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-muted">{description}</p>

      <div className="mt-6 rounded-lg border border-dashed border-border bg-surface-raised p-5">
        <p className="text-sm font-medium text-foreground">
          Shell only — no editor is connected yet.
        </p>
        <p className="mt-1 text-sm text-muted">
          This section becomes functional in task{" "}
          <span className="font-medium text-foreground">{task}</span>. Until
          then it performs no reads or writes and shows no live data.
        </p>

        {points.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {children}
    </section>
  );
}
