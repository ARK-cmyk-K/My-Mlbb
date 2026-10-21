import { Suspense } from "react";
import Link from "next/link";

import { ExplorerNotice } from "@/app/components/explorer/explorer-cards";
import { CollectionExplorer } from "@/app/components/explorer/collection-explorer";
import { parseExplorerState } from "@/app/lib/explorer/explorer-model";

import { loadExplorerCollection } from "./explorer-data";

/**
 * Public collection explorer (task 05-04).
 *
 * Cache Components layout: the heading, copy and back link are the static
 * shell; everything that depends on the request URL (`searchParams`) or on a
 * data read sits *below* the `<Suspense>` boundary, so `/collection` still
 * prerenders its shell and streams the explorer — including for shared links
 * like `?view=skins&rarity=collector`.
 *
 * Reading `searchParams` here is what makes a shared/filtered URL render the
 * right results as HTML (not just after hydration): the server parses the URL
 * with the same pure `parseExplorerState()` the client uses, and the client
 * component renders the same pure `runExplorer()` result, so the first paint
 * and the hydrated UI cannot disagree.
 *
 * Published-only: the data loader resolves exclusively from the `published_*`
 * projection through the content-service port; draft rows cannot reach this
 * route.
 */

export const metadata = {
  title: "Collection explorer — MLBB Showcase",
  description:
    "Browse every published hero and skin in the collection: search and filter by role, rarity, series, ownership, and favorites.",
};

type CollectionSearchParams = PageProps<"/collection">["searchParams"];

export default function CollectionPage({
  searchParams,
}: PageProps<"/collection">) {
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          Collection
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-foreground">
          Explore the collection
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
          Every published hero and skin — searchable and filterable by role,
          rarity, series, ownership, and favorites.
        </p>
        <p className="mt-4">
          <Link
            href="/"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            ← Back to home
          </Link>
        </p>

        <Suspense fallback={<ExplorerFallback />}>
          <ExplorerSection searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

/**
 * Resolves the request URL and the published collection, then renders the
 * explorer or the matching non-happy state.
 *
 * Kept as its own async component so both awaits happen below the page's
 * Suspense boundary (the shell above never waits for them).
 */
async function ExplorerSection({
  searchParams,
}: {
  searchParams: CollectionSearchParams;
}) {
  const params = await searchParams;
  const state = parseExplorerState(params);
  const loaded = await loadExplorerCollection();

  if (loaded.status === "error") {
    return (
      <ExplorerNotice
        title="The collection is unavailable"
        body={`${loaded.message} Nothing is being shown from cache or drafts — please try again in a moment.`}
        action={{ href: "/collection", label: "Try again" }}
      />
    );
  }

  if (loaded.status === "empty") {
    return (
      <ExplorerNotice
        title="Nothing published yet"
        body="There are no published heroes or skins to explore right now. The explorer fills up as soon as a release is published."
        action={{ href: "/", label: "Back to home" }}
      />
    );
  }

  return (
    <CollectionExplorer
      collection={loaded.collection}
      initialState={state}
    />
  );
}

/**
 * Reserved space while the URL and the published release resolve, mirroring the
 * homepage's showcase fallback so a slow first paint never jumps the layout.
 */
function ExplorerFallback() {
  return (
    <div
      className="mt-8"
      aria-hidden="true"
      aria-busy="true"
    >
      <div className="h-6 w-56 animate-pulse rounded bg-surface-raised" />
      <div className="mt-4 h-40 animate-pulse rounded-xl bg-surface-raised/60" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            className="aspect-[4/5] animate-pulse rounded-xl bg-surface-raised/60"
          />
        ))}
      </div>
    </div>
  );
}
