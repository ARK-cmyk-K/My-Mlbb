import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "../supabase/server.ts";
import { readSupabaseConfig } from "../supabase/config.ts";
import { ContentServiceError } from "./errors.ts";

/**
 * Narrow, deliberately *untyped* view over the Supabase PostgREST client
 * (task 02-03).
 *
 * Why: the Supabase query-builder generics are inferred from a generated
 * `Database` type. This project has no generated types yet (there is no hosted
 * project to introspect), so passing the raw `SupabaseClient` around makes
 * TypeScript try to instantiate those generics against `any` and fail with
 * `TS2589: Type instantiation is excessively deep and possibly infinite`. The
 * application does not need generated column types — every row is funnelled
 * through the runtime validators/mappers in this folder — so the service is
 * written against this small structural surface, and the single cast back to
 * `SupabaseClient` happens in one place ({@link asPostgrestClient}).
 *
 * Security: this module holds *no* credentials. It only shapes the client that
 * `createSupabaseServerClient()` (anon key only) already produced.
 */

/** A PostgREST error as surfaced by supabase-js. `code` is the SQLSTATE. */
export interface PostgrestErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/**
 * The result of a PostgREST query. `data` is an array for list/select queries
 * and an object or `null` for `single()`/`maybeSingle()`.
 */
export interface QueryResult<TRow = Record<string, unknown>> {
  data: TRow | TRow[] | null;
  error: PostgrestErrorLike | null;
}

/**
 * A fluent PostgREST query builder, limited to the methods the content service
 * actually calls. Every method returns the builder, and the builder is
 * awaitable, mirroring `supabase-js` semantics.
 */
export interface QueryBuilder<TRow = Record<string, unknown>>
  extends PromiseLike<QueryResult<TRow>> {
  select(columns?: string): QueryBuilder<TRow>;
  insert(values: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<TRow>;
  update(values: Record<string, unknown>): QueryBuilder<TRow>;
  delete(): QueryBuilder<TRow>;
  eq(column: string, value: unknown): QueryBuilder<TRow>;
  neq(column: string, value: unknown): QueryBuilder<TRow>;
  in(column: string, values: readonly unknown[]): QueryBuilder<TRow>;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ): QueryBuilder<TRow>;
  limit(count: number): QueryBuilder<TRow>;
  single(): PromiseLike<QueryResult<TRow>>;
  maybeSingle(): PromiseLike<QueryResult<TRow>>;
}

/** The subset of the Supabase client the content service uses. */
export interface PostgrestLike {
  from(table: string): QueryBuilder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<QueryResult>;
}

/** Re-exported so the service can type the auth calls it makes. */
export type AuthLike = SupabaseClient["auth"];

/**
 * Views an existing Supabase client through {@link PostgrestLike}. The cast is
 * sound at runtime (the real client has every method used here); it exists only
 * to keep the service off the deeply-generic builder types.
 */
export function asPostgrestClient(client: SupabaseClient): PostgrestLike {
  return client as unknown as PostgrestLike;
}

/**
 * Verifies Supabase is configured and returns the request-scoped client, or
 * throws `NOT_CONFIGURED`. Shared by the admin and public code paths.
 */
export async function requireSupabaseClient(): Promise<SupabaseClient> {
  if (!readSupabaseConfig(process.env)) {
    throw new ContentServiceError("NOT_CONFIGURED");
  }
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new ContentServiceError("NOT_CONFIGURED");
  }
  return client;
}
