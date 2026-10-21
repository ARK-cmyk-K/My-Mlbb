import "server-only";

import { requireSupabaseAnonClient } from "@/app/lib/content/client";
import { ContentServiceError } from "@/app/lib/content/errors";
import {
  parseSearchPayload,
  type CategorizedSearchResults,
} from "./search-model.ts";

/**
 * Published-content search (task `06-01`).
 *
 * The only read path is the approved `search_published_content` RPC
 * (migration `01-05`), which runs with the **invoker's** privileges and can
 * therefore only see what `anon` is granted: the four `published_*` projection
 * tables. There is deliberately no client-side query path — the browser calls
 * the route handler below, the route handler calls the RPC with the anon key,
 * and a draft row is not reachable from either end.
 *
 * The service never leaks store internals: a missing project
 * (`NOT_CONFIGURED`) and an unreachable store (`STORE_UNAVAILABLE`) carry a
 * caller-safe message, and the underlying error is kept on `cause` for the
 * server log only.
 */

/** Name of the approved RPC. */
export const SEARCH_RPC_NAME = "search_published_content";

/**
 * Runs the published search.
 *
 * @param query The already-normalised query.
 * @param limit Maximum results per category (the RPC clamps it again).
 */
export async function searchPublishedContent(
  query: string,
  limit: number
): Promise<CategorizedSearchResults> {
  const db = requireSupabaseAnonClient();
  const result = await db.rpc(SEARCH_RPC_NAME, {
    p_query: query,
    p_limit: limit,
  });

  if (result.error) {
    throw new ContentServiceError("STORE_UNAVAILABLE", {
      cause: result.error,
      message: "The content store is temporarily unavailable.",
    });
  }

  return parseSearchPayload(result.data);
}
