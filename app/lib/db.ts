import { cache } from "react";

import { readSupabaseConfig } from "./supabase/config";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * Authorization helper for the private dashboard (task 02-01).
 *
 * The single source of truth for "is this request the configured admin?":
 *
 *   1. If Supabase is not configured, deny (fail closed).
 *   2. Resolve the *verified* session with `auth.getUser()`. Unlike
 *      `getSession()`, this revalidates the token with the Auth server, so a
 *      forged or expired cookie is treated as "no session".
 *   3. Ask the database `public.is_admin()` predicate (SECURITY DEFINER,
 *      `search_path = ''`, fails closed): it returns true only when the verified
 *      `auth.uid()` matches the single `public.admin_identity.admin_user_id`.
 *      EXECUTE is granted to `authenticated` only, which is why the session is
 *      resolved before the RPC is called.
 *
 * `public.admin_identity.admin_user_id` is NULL until an operator maps the
 * admin account, so `is_admin()` is false for everyone until that documented
 * setup step is performed. That is intended, not a defect.
 *
 * The wrap in React's `cache()` deduplicates the check within a single render
 * pass, so the layout and each page can both call it at no extra cost.
 */

const resolveAdminAccess = cache(async (): Promise<boolean> => {
  if (!readSupabaseConfig(process.env)) {
    // No connection details: nothing can be verified, so deny without touching
    // the network.
    return false;
  }

  // `createSupabaseServerClient` reads the request cookies. That call is
  // deliberately kept *outside* the try/catch below: during a static
  // prerender, reading a request-time API throws a framework-controlled error
  // that Next.js uses to switch the route to per-request rendering. Swallowing
  // it would bake the current result in at build time. `requireAdmin` calls
  // `connection()` first, so in practice this already runs per request.
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return false;
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const { data, error } = await supabase.rpc("is_admin");

    return !error && data === true;
  } catch {
    // Network failure, malformed token, or RPC error: deny. An authorization
    // check must never throw out of its caller.
    return false;
  }
});

/**
 * Resolves whether the current request is the configured single admin.
 * Always resolves to a boolean; it never throws.
 */
export function isAdminUser(): Promise<boolean> {
  return resolveAdminAccess();
}
