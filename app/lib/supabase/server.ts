import { cache } from "react";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { readSupabaseConfig } from "./config";

/**
 * Request-scoped Supabase client for server code (task 02-01).
 *
 * Returns `null` when Supabase is not configured, so callers must fail closed
 * rather than throwing. A new client is created for every request — sessions
 * are never shared between requests.
 *
 * Cookie handling follows the supported `@supabase/ssr` pattern: `getAll` is
 * required so token refreshes can read the whole cookie jar including chunked
 * auth cookies; `setAll` writes refreshed cookies back. In a Server Component
 * the cookie store is read-only, so `setAll` swallows that specific failure —
 * keeping the session fresh is the job of the root `proxy.ts`.
 *
 * This client uses only the public `anon` key. No service-role credential is
 * ever loaded here or exposed to the browser.
 *
 * Wrapped in React's `cache()` (per the 02-01/review recommendation) so that
 * repeated calls within a single request/render pass reuse one client instead
 * of re-reading the cookie jar and re-instantiating `@supabase/ssr`. React's
 * cache is request-scoped, so clients are never shared across requests. The
 * `cookies()` read stays inside the cached body but runs on the first call of
 * the pass, preserving Next.js' dynamic-rendering signal.
 */
export const createSupabaseServerClient = cache(
  async (): Promise<SupabaseClient | null> => {
    const config = readSupabaseConfig(process.env);
  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // root proxy refreshes the session instead; see proxy.ts.
        }
      },
    },
  });
  },
);

/**
 * Cookie-free Supabase client for *cacheable* public reads (task 05-03).
 *
 * Why this exists: `createSupabaseServerClient()` reads `cookies()`, which makes
 * any caller a request-time dependency. The public showcase read is wrapped in
 * `"use cache"` (see `app/lib/content/service.ts`) so it can be prerendered into
 * the static shell — and Next.js rejects reading `cookies()` inside a cached
 * function. This client is deliberately built with an empty cookie jar instead:
 *
 *   - It uses only the public `anon` key, exactly like the request-scoped client.
 *   - Public reads touch only the `published_*` tables and the
 *     `published_release` view, which RLS already exposes to `anon`.
 *   - The published snapshot is session-independent by design (every visitor
 *     sees the same release), so omitting the session cannot change the result —
 *     it is what makes the read safe to cache and share between visitors.
 *
 * Authorization for admin-only paths still goes through
 * `createSupabaseServerClient()`; this factory must never be used for them.
 *
 * Returns `null` when Supabase is not configured, so callers fail closed.
 */
export function createSupabaseAnonClient(): SupabaseClient | null {
  const config = readSupabaseConfig(process.env);
  if (!config) {
    return null;
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      // No session persistence and no token refresh: this client is stateless
      // and never authenticated, so there is nothing to keep alive.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
