import { createServerClient } from "@supabase/ssr";
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
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
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
}
