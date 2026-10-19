/**
 * Supabase connection configuration (task 02-01).
 *
 * Reads the *public* Supabase Auth connection details from the environment.
 * Only the URL and the `anon` key are used here — never the service-role key.
 * The `anon` key is designed to be public; authorization is enforced in the
 * database by RLS and by `public.is_admin()`, not by keeping this key secret.
 *
 * The function is intentionally pure (it takes the environment as an argument)
 * so it can be unit-tested without a running Supabase project. When the values
 * are absent or malformed it returns `null`, and every caller must fail closed.
 */

/** Environment keys that must be present for Supabase Auth to be usable. */
export const SUPABASE_ENV_KEYS = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
} as const;

export interface SupabaseConfig {
  /** Normalized project origin, e.g. `https://abcdefgh.supabase.co`. */
  url: string;
  /** Public `anon` API key (safe for the browser; RLS does the authorization). */
  anonKey: string;
}

/**
 * Parses and validates the Supabase connection details.
 *
 * Returns `null` (fail closed) when either value is missing, blank, or the URL
 * is not an absolute `http(s)` URL. The `anon` key is never logged.
 */
export function readSupabaseConfig(
  env: Record<string, string | undefined>
): SupabaseConfig | null {
  const url = (env[SUPABASE_ENV_KEYS.url] ?? "").trim();
  const anonKey = (env[SUPABASE_ENV_KEYS.anonKey] ?? "").trim();

  if (url.length === 0 || anonKey.length === 0) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  // Normalize: drop any path/query and the trailing slash so the URL is stable.
  return { url: parsed.origin, anonKey };
}
