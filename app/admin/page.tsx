import Link from "next/link";

import { requireAdmin } from "../auth/requireAdmin";
import { DashboardIcon } from "./dashboard-icons";
import { dashboardNavItems } from "./dashboard-nav";

/**
 * Dashboard overview (task 02-02).
 *
 * Server component: it re-checks authorization and renders orientation content
 * plus links into each placeholder section. No data is read from the database
 * here — the draft/published service lands in task 02-03.
 */
export default async function AdminOverviewPage() {
  await requireAdmin();

  // Overview itself is excluded from the quick-link grid.
  const sections = dashboardNavItems.filter((item) => item.href !== "/admin");

  return (
    <section className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
        Dashboard overview
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Private workspace for the MLBB Showcase. Content is edited here as
        drafts and only becomes public through a release. This shell adds
        navigation and layout; the individual editors arrive in later tasks.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-surface-raised p-5">
        <h2 className="font-display text-base font-semibold text-foreground">
          Current status
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <span className="font-medium text-foreground">
              Authentication is a fail-closed scaffold.
            </span>{" "}
            The admin session check and the database admin mapping (task 02-01)
            are not finished, so this route is protected but not yet usable by
            an operator.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Draft and published data are not connected.
            </span>{" "}
            The header status markers stay empty until the draft/published state
            service (task 02-03) is in place.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Nothing here reads or writes data.
            </span>{" "}
            Each section below is a labelled placeholder.
          </li>
        </ul>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold text-foreground">
        Sections
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {sections.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex h-full gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-raised"
            >
              <span className="mt-0.5 text-primary">
                <DashboardIcon name={item.id} />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-foreground">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-sm text-muted">
                  {item.description}
                </span>
                <span className="mt-2 block text-xs uppercase tracking-wide text-muted">
                  Task {item.task}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
