import "server-only";

import type { PublishedRelease } from "@/app/lib/content/contracts";
import { contentService } from "@/app/lib/content";

/**
 * Loads the published release for the public showcase (task 05-03).
 *
 * Split out of the page for two reasons:
 *
 * 1. Suspense placement. The read is cached (`getPublishedRelease` uses
 *    `use cache`), but a cached function still awaits, so Cache Components needs
 *    it behind a `<Suspense>` boundary instead of blocking the static shell.
 *    Keeping it deeper in the tree means the page heading and copy stay in the
 *    shell while this resolves.
 * 2. One data source. The page composes sections from the returned release; no
 *    other module reads the content service on the public path.
 *
 * `null` means "nothing is published yet" — a normal state for a fresh
 * deployment, not an error — and the page renders its unpublished shell.
 */
export async function loadPublishedRelease(): Promise<PublishedRelease | null> {
  try {
    return await contentService.getPublishedRelease();
  } catch {
    return null;
  }
}

/**
 * Account stats live in the release snapshot payload (04-05/04-06) and are not
 * part of the `PublishedRelease` DTO yet, so they are read defensively: a
 * missing snapshot or a missing field simply omits that value rather than
 * inventing one.
 */
export interface PublishedAccountStats {
  display_name?: string;
  total_matches?: number;
  win_rate?: number | null;
  rank_label?: string;
  highest_rank_label?: string;
  avatar_media_id?: string | number;
  spotlight_media_id?: string | number;
}

/** A published release that may carry its frozen snapshot payload. */
export type PublishedHomeRelease = PublishedRelease & {
  release_snapshots?: Array<{ account_stats?: PublishedAccountStats }>;
};

/**
 * Narrow accessor for the snapshot account stats.
 *
 * The cast is isolated here (rather than sprinkled through the page) so the
 * single unsafe read of the not-yet-typed snapshot payload is easy to find and
 * delete once the DTO exposes it.
 */
export function readAccountStats(
  release: PublishedRelease | null
): PublishedAccountStats | undefined {
  return (release as PublishedHomeRelease | null)?.release_snapshots?.[0]
    ?.account_stats;
}
