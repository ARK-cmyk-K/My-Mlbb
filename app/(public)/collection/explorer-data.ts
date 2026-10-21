import "server-only";

import {
  contentService,
  isContentServiceError,
  serializeContentError,
} from "@/app/lib/content";
import type { ExplorerCollection } from "@/app/lib/explorer/explorer-model";

/**
 * Loads the published collection for the explorer (task 05-04).
 *
 * Published-only by construction: the result comes from
 * `contentService.getPublishedRelease()`, which reads the `published_*`
 * projection exclusively, and only the two slices the explorer renders are
 * passed on to the client (achievements and timeline entries stay on the
 * server for this route).
 *
 * Three outcomes, because the UI must distinguish them:
 *
 * - `ready`   — a published release exists; render the explorer.
 * - `empty`   — `NO_PUBLISHED_RELEASE`. Note the service deliberately reports a
 *               store outage the same way (see `getCachedPublishedRelease`: a
 *               `"use cache"` body must not throw during prerender), so this
 *               copy has to cover "nothing published yet" *and* "nothing
 *               available right now" without claiming more than it knows.
 * - `error`   — any other typed failure. The message comes from the
 *               caller-safe serializer (never SQL, never stack traces).
 */
export type CollectionLoad =
  | { status: "ready"; collection: ExplorerCollection }
  | { status: "empty" }
  | { status: "error"; message: string };

const GENERIC_ERROR_MESSAGE = "The collection could not be loaded right now.";

export async function loadExplorerCollection(): Promise<CollectionLoad> {
  try {
    const release = await contentService.getPublishedRelease();
    return {
      status: "ready",
      collection: { heroes: release.heroes, skins: release.skins },
    };
  } catch (error) {
    if (
      isContentServiceError(error) &&
      error.code === "NO_PUBLISHED_RELEASE"
    ) {
      return { status: "empty" };
    }
    return {
      status: "error",
      message: isContentServiceError(error)
        ? serializeContentError(error).message
        : GENERIC_ERROR_MESSAGE,
    };
  }
}
