import Link from "next/link";

import { requireAdmin } from "../../auth/requireAdmin";
import { contentService } from "../../lib/content";
import {
  ContentServiceError,
  isContentServiceError,
} from "../../lib/content/errors";
import { DRAFT_STATE_LABELS } from "../../lib/content/contracts";
import type { DraftHero } from "../../lib/content/contracts";
import { HeroRowActions } from "./hero-row-actions";

/**
 * Heroes list (task 03-01).
 *
 * Server component: re-checks authorization and reads the draft working set via
 * the content service (admin-only, RLS-backed). Renders loading (via
 * `loading.tsx`), empty, error, and populated states, plus a success notice
 * driven by the `notice` query parameter set by the Server Actions on redirect.
 */

const NOTICE_MESSAGES: Record<string, string> = {
  created: "Hero created.",
  updated: "Hero updated.",
  deleted: "Hero deleted.",
  archived: "Hero archived.",
  restored: "Hero restored.",
  published: "Hero marked as published.",
  unpublished: "Hero returned to draft.",
};

type HeroesPageProps = PageProps<"/admin/heroes"> | { searchParams: Promise<{ notice?: string }> };

export default async function HeroesPage({ searchParams }: HeroesPageProps) {
  await requireAdmin();

  const params = await searchParams;
  const notice =
    typeof params.notice === "string" ? NOTICE_MESSAGES[params.notice] : undefined;

  let heroes: DraftHero[] | null = null;
  let loadError: string | null = null;
  try {
    heroes = await contentService.listDraftHeroes({ includeArchived: true });
  } catch (error) {
    loadError = isContentServiceError(error)
      ? error.message
      : "The hero list could not be loaded.";
    if (
      error instanceof ContentServiceError &&
      (error.code === "UNAUTHENTICATED" || error.code === "UNAUTHORIZED")
    ) {
      // The guard should already have redirected; fail closed anyway.
      throw error;
    }
  }

  return (
    <section className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Heroes
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Create, edit, archive and delete the heroes shown on the public
            showcase. Everything here is stored as a draft until a release is
            published.
          </p>
        </div>
        <Link
          href="/admin/heroes/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          New hero
        </Link>
      </div>

      {notice ? (
        <p
          role="status"
          className="mt-5 rounded-md border border-border bg-surface-raised px-4 py-2 text-sm text-foreground"
        >
          {notice}
        </p>
      ) : null}

      {loadError ? (
        <div className="mt-6 rounded-lg border border-border bg-surface-raised p-5">
          <p className="text-sm font-medium text-foreground">
            Could not load heroes
          </p>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          <p className="mt-2 text-xs text-muted">
            If the content store is not configured, set
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_URL</code> and
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and
            reload.
          </p>
        </div>
      ) : heroes && heroes.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-surface-raised p-8 text-center">
          <p className="text-sm font-medium text-foreground">No heroes yet</p>
          <p className="mt-2 text-sm text-muted">
            Create your first hero to start building the showcase.
          </p>
          <Link
            href="/admin/heroes/new"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            New hero
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Draft heroes</caption>
            <thead className="bg-surface-raised text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Roles
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Mastery
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Matches
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Win rate
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  State
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {heroes?.map((hero) => (
                <tr key={hero.id} className="border-t border-border">
                  <th scope="row" className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/admin/heroes/${hero.id}`}
                      className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {hero.name}
                    </Link>
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      {hero.slug}
                    </span>
                  </th>
                  <td className="px-4 py-3 text-muted">
                    {hero.primaryRole}
                    {hero.secondaryRole ? ` / ${hero.secondaryRole}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {hero.masteryLevel}
                  </td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {hero.totalMatches}
                  </td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {hero.winRate === null ? "—" : `${hero.winRate}%`}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {DRAFT_STATE_LABELS[hero.publicationState]}
                  </td>
                  <td className="px-4 py-3">
                    <HeroRowActions hero={hero} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
