/**
 * Pure authorization policy for the single-admin dashboard (task 02-01).
 *
 * This module has **no imports** and no side effects on purpose:
 *
 *   1. It is the one place that decides whether a request may see the private
 *      dashboard, so the rule is easy to audit and to unit-test.
 *   2. Keeping it dependency-free lets the repository's `node --test` suite
 *      exercise it directly (see `access-policy.test.ts`).
 *
 * The real session — a verified Supabase `auth.getUser()` result plus the
 * database `public.is_admin()` predicate — is resolved in `app/lib/db.ts`,
 * which then feeds its findings into `evaluateAdminAccess()` here.
 */

/** Why a request was allowed or denied access to the dashboard. */
export type AdminAccessReason =
  | "allowed"
  | "not-configured"
  | "no-session"
  | "not-admin";

export interface AdminAccessInput {
  /** Whether the Supabase connection details are present and valid. */
  configured: boolean;
  /** Whether a verified, authenticated user was resolved for the request. */
  hasUser: boolean;
  /** Whether the database reported that user as the configured admin. */
  isAdmin: boolean;
}

export interface AdminAccessDecision {
  allowed: boolean;
  reason: AdminAccessReason;
}

/**
 * The single-admin access rule, evaluated top-down and fail-closed:
 *
 *   - No Supabase config -> deny (`not-configured`). Never guess.
 *   - No verified user    -> deny (`no-session`). A missing or expired session
 *     surfaces here as `hasUser: false`.
 *   - User is not the admin (or `is_admin()` errored) -> deny (`not-admin`).
 *   - Otherwise -> allow.
 */
export function evaluateAdminAccess(
  input: AdminAccessInput
): AdminAccessDecision {
  if (!input.configured) {
    return { allowed: false, reason: "not-configured" };
  }

  if (!input.hasUser) {
    return { allowed: false, reason: "no-session" };
  }

  if (!input.isAdmin) {
    return { allowed: false, reason: "not-admin" };
  }

  return { allowed: true, reason: "allowed" };
}

/** Default landing page after a successful admin sign-in. */
export const DASHBOARD_HOME = "/admin";

/**
 * Validates a post-login redirect target so it can never be used as an open
 * redirect.
 *
 * Only same-origin paths under the private dashboard are accepted. Absolute
 * URLs, protocol-relative URLs (`//evil.example`), backslash tricks, control
 * characters, and any non-`/admin` path fall back to `DASHBOARD_HOME`.
 */
export function sanitizeRedirectTarget(
  raw: unknown,
  fallback: string = DASHBOARD_HOME
): string {
  if (typeof raw !== "string") {
    return fallback;
  }

  const value = raw.trim();

  // Must be a rooted path, not an absolute or protocol-relative URL.
  if (!value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  // Reject backslashes and control characters that browsers may normalize.
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  // Parse against a fixed base to normalize dot segments and split off the
  // query string, then confine the pathname to the dashboard.
  let parsed: URL;
  try {
    parsed = new URL(value, "http://localhost");
  } catch {
    return fallback;
  }

  const { pathname } = parsed;

  if (pathname !== DASHBOARD_HOME && !pathname.startsWith(`${DASHBOARD_HOME}/`)) {
    return fallback;
  }

  // Keep the query string (e.g. `/admin/releases?page=2`); drop any fragment.
  return `${pathname}${parsed.search}`;
}
