import Link from "next/link";

import { requireAdmin } from "../../auth/requireAdmin";
import { contentService } from "../../lib/content";
import {
  ContentServiceError,
  isContentServiceError,
} from "../../lib/content/errors";
import { DRAFT_STATE_LABELS } from "../../lib/content/contracts";
import type { DraftHero, DraftSkin } from "../../lib/content/contracts";
import { SkinRowActions } from "./skin-row-actions";

/**
 * Skins list (task 03-02).
 *
 * Server component: re-checks authorization and reads the draft working set via
 * the content service (admin-only, RLS-backed). Heroes are loaded alongside so
 * the list can show the association without a second client request. Renders
 * loading (via `loading.tsx`), empty, error, and populated states, plus a success
 * notice driven by the `notice` query parameter set by the Server Actions on
 * redirect.
 */

const NOTICE_MESSAGES: Record<string, string> = {
  created: "Skin created.",
  updated: "Skin updated.",
  deleted: "Skin deleted.",
  archived: "Skin archived.",
  restored: "Skin restored.",
  published: "Skin marked as published.",
  unpublished: "Skin returned to draft.",
};

type SkinsPageProps =
  | PageProps<"/admin/skins">
  | { searchParams: Promise<{ notice?: string }> };

export default async function SkinsPage({ searchParams }: SkinsPageProps) {
  await requireAdmin();

  const params = await searchParams;
  const notice =
    typeof params.notice === "string" ? NOTICE_MESSAGES[params.notice] : undefined;

  let skins: DraftSkin[] | null = null;
  let heroes: DraftHero[] = [];
  let loadError: string | null = null;
  try {
    [skins, heroes] = await Promise.all([
      contentService.listDraftSkins({ includeArchived: true }),
      contentService.listDraftHeroes({ includeArchived: true }),
    ]);
  } catch (error) {
    loadError = isContentServiceError(error)
      ? error.message
      : "The skin list could not be loaded.";
    if (
      error instanceof ContentServiceError &&
      (error.code === "UNAUTHENTICATED" || error.code === "UNAUTHORIZED")
    ) {
      // The guard should already have redirected; fail closed anyway.
      throw error;
    }
  }

  const heroNames = new Map(heroes.map((hero) => [hero.id, hero.name]));

  return (
    <section className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Skins
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Create, edit, archive and delete the skin collection. Everything here
            is stored as a draft until a release is published.
          </p>
        </div>
        <Link
          href="/admin/skins/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          New skin
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
            Could not load skins
          </p>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          <p className="mt-2 text-xs text-muted">
            If the content store is not configured, set
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_URL</code> and
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and
            reload.
          </p>
        </div>
      ) : skins && skins.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-surface-raised p-8 text-center">
          <p className="text-sm font-medium text-foreground">No skins yet</p>
          <p className="mt-2 text-sm text-muted">
            Create your first skin to start building the collection.
          </p>
          <Link
            href="/admin/skins/new"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            New skin
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Draft skins</caption>
            <thead className="bg-surface-raised text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Hero
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Rarity
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Series
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Flags
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
              {skins?.map((skin) => (
                <tr key={skin.id} className="border-t border-border">
                  <th scope="row" className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/admin/skins/${skin.id}`}
                      className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {skin.name}
                    </Link>
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      {skin.slug}
                    </span>
                  </th>
                  <td className="px-4 py-3 text-muted">
                    {skin.heroId
                      ? (heroNames.get(skin.heroId) ?? "Unknown hero")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{skin.rarity}</td>
                  <td className="px-4 py-3 text-muted">{skin.series ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {skin.isOwned ? "Owned" : "Not owned"}
                    {skin.isFavorite ? " · Favorite" : ""}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {DRAFT_STATE_LABELS[skin.publicationState]}
                  </td>
                  <td className="px-4 py-3">
                    <SkinRowActions skin={skin} />
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
