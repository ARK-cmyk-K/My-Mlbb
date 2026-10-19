import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAdminUser } from "../db.ts";
import { asPostgrestClient } from "../content/client.ts";
import { ContentServiceError } from "../content/errors.ts";
import { createSupabaseServerClient } from "../supabase/server.ts";
import { readSupabaseConfig } from "../supabase/config.ts";
import {
  createMediaService,
  type MediaRegistryPort,
  type MediaService,
  type MediaStoragePort,
  type NewMediaRow,
  type ResolvedUploadActor,
} from "./upload-service.ts";

/**
 * Supabase-backed media service (task 02-04).
 *
 * Wires the provider-independent orchestrator in `./upload-service.ts` to real
 * Supabase Storage and the `public.media` registry. Authorization is resolved by
 * the established `02-01` predicate (`isAdminUser()` -> verified session +
 * `public.is_admin()`), and RLS remains the load-bearing gate: the storage
 * policies in `20261019160000_storage_buckets_and_policies.sql` and the `media`
 * policies from `01-04` apply to the same anon-key, request-scoped client used
 * everywhere else.
 *
 * Security posture:
 *   - Only the public URL/anon key are used. No service-role key is read here.
 *   - Uploads always target the private draft bucket, under a server-generated
 *     UUID name, with the *verified* content type. The public bucket is never a
 *     direct upload target.
 *   - `media` rows are inserted with `publication_state = 'draft'`; promoting
 *     media to published is the publish transaction of task 04-06.
 */

export function createSupabaseMediaService(): MediaService {
  return createMediaService({
    resolveActor: resolveUploadActor,
    storage: createSupabaseStoragePort(),
    registry: createSupabaseMediaRegistry(),
    generateId: () => crypto.randomUUID(),
  });
}

/**
 * Resolves the verified session and the admin verdict. Never throws on an
 * authorization failure — it reports facts and lets the policy layer fail
 * closed, so the caller receives the precise `NOT_CONFIGURED` /
 * `UNAUTHENTICATED` / `UNAUTHORIZED` code.
 *
 * `createSupabaseServerClient()` reads request cookies and is deliberately kept
 * outside the try/catch: during prerender it throws a framework-controlled
 * dynamic-usage signal that must not be swallowed (same rule as `app/lib/db.ts`).
 */
async function resolveUploadActor(): Promise<ResolvedUploadActor> {
  const anonymous: ResolvedUploadActor = {
    configured: true,
    authenticated: false,
    isAdmin: false,
    userId: null,
  };

  if (!readSupabaseConfig(process.env)) {
    return { ...anonymous, configured: false };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return { ...anonymous, configured: false };
  }

  try {
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      return anonymous;
    }

    const isAdmin = await isAdminUser();
    return {
      configured: true,
      authenticated: true,
      isAdmin,
      userId: user.id,
    };
  } catch {
    // A network or Auth failure must never be treated as an authorized session.
    return anonymous;
  }
}

/** Real Storage operations. Content type is always the policy-verified value. */
function createSupabaseStoragePort(): MediaStoragePort {
  return {
    async upload(bucket, objectPath, bytes, contentType) {
      const client = await requireClient();
      const { error } = await client.storage
        .from(bucket)
        .upload(objectPath, bytes, {
          contentType,
          upsert: false,
          cacheControl: "3600",
        });
      if (error) {
        throw new ContentServiceError("STORE_UNAVAILABLE", { cause: error });
      }
    },

    async remove(bucket, objectPath) {
      const client = await requireClient();
      const { error } = await client.storage.from(bucket).remove([objectPath]);
      if (error) {
        throw new ContentServiceError("STORE_UNAVAILABLE", { cause: error });
      }
    },
  };
}

/** Inserts the `public.media` metadata row for a freshly uploaded object. */
function createSupabaseMediaRegistry(): MediaRegistryPort {
  return {
    async insert(row: NewMediaRow) {
      const client = await requireClient();
      const db = asPostgrestClient(client);
      const result = await db
        .from("media")
        .insert({
          id: row.id,
          storage_bucket: row.storageBucket,
          object_path: row.objectPath,
          kind: row.kind,
          mime_type: row.mimeType,
          byte_size: row.byteSize,
          publication_state: "draft",
          created_by: row.createdBy,
        })
        .select("id")
        .maybeSingle();
      if (result.error) {
        throw mapMediaWriteError(result.error);
      }
    },
  };
}

/**
 * Verifies Supabase is configured and returns the request-scoped client, or
 * throws `NOT_CONFIGURED`. The anon key only — never a service-role key.
 */
async function requireClient(): Promise<SupabaseClient> {
  if (!readSupabaseConfig(process.env)) {
    throw new ContentServiceError("NOT_CONFIGURED");
  }
  const client = await createSupabaseServerClient();
  if (!client) {
    throw new ContentServiceError("NOT_CONFIGURED");
  }
  return client;
}

/**
 * Maps a `media` write failure to a typed error. The row is fully validated
 * before insert, so these are defensive: a unique violation is a conflict, a
 * CHECK violation is a validation fault, a missing FK dependency is a 422.
 */
function mapMediaWriteError(error: unknown): ContentServiceError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  switch (code) {
    case "23505":
      return new ContentServiceError("CONFLICT", { cause: error });
    case "23503":
      return new ContentServiceError("DEPENDENCY_MISSING", { cause: error });
    case "23514":
      return new ContentServiceError("VALIDATION_FAILED", { cause: error });
    default:
      return new ContentServiceError("STORE_UNAVAILABLE", { cause: error });
  }
}
