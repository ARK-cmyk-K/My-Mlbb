import { NextResponse } from "next/server";

import {
  isContentServiceError,
  serializeContentError,
} from "@/app/lib/content/errors";
import {
  EMPTY_SEARCH_RESULTS,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_RESULT_LIMIT,
  isSearchableQuery,
  normalizeSearchQuery,
} from "@/app/lib/search/search-model";
import { searchPublishedContent } from "@/app/lib/search/search-service";

/**
 * Global search endpoint (task `06-01`).
 *
 * `GET /api/search?q=<query>`
 *
 * The endpoint is a thin, validating wrapper around the approved published
 * search RPC:
 *
 * - the query is normalised and length-bounded before it reaches the store;
 * - the response only ever contains published entries, because the RPC can
 *   only read the `published_*` projection with `anon` privileges;
 * - a store failure is reported as a `503` with a caller-safe message — the
 *   Supabase error itself never reaches the browser;
 * - responses are not cached: a search result depends on the query, and the
 *   store is the source of truth.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = normalizeSearchQuery(url.searchParams.get("q"));

  if (!isSearchableQuery(query)) {
    return NextResponse.json(
      {
        status: "empty" as const,
        query,
        results: EMPTY_SEARCH_RESULTS,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const results = await searchPublishedContent(query, SEARCH_RESULT_LIMIT);
    return NextResponse.json(
      {
        status: "ok" as const,
        query: query.slice(0, SEARCH_QUERY_MAX_LENGTH),
        results,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (isContentServiceError(error)) {
      const serialized = serializeContentError(error);
      return NextResponse.json(
        {
          status: "error" as const,
          code: serialized.code,
          message: serialized.message,
        },
        {
          status: serialized.status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }
    return NextResponse.json(
      {
        status: "error" as const,
        code: "STORE_UNAVAILABLE",
        message: "The content store is temporarily unavailable.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
