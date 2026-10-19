import { connection } from "next/server";
import { redirect } from "next/navigation";

import { isAdminUser } from "../lib/db";

/**
 * Server-side dashboard guard (tasks 02-01 and 02-02).
 *
 * Every private dashboard route calls `requireAdmin()` on the server before it
 * renders. The check uses `isAdminUser()` in `app/lib/db.ts`, which verifies
 * the Supabase session and asks the database `public.is_admin()` predicate. It
 * fails closed: an unconfigured project, a missing/expired session, a non-admin
 * user, or any error is denied.
 *
 * `connection()` deliberately stops prerendering: the answer depends on the
 * caller's cookie, so it must never be baked into a static build output. The
 * `/admin` segment sets `instant = false` to allow rendering to block on this
 * request-time check (see the authentication guide for Cache Components).
 *
 * Security notes:
 *   - This module is server-only. Never import it into a client component; the
 *     guard must run before any privileged data is read.
 *   - The guard lives next to the data (per the Next.js authentication guide);
 *     the layout calls it and each page calls it again, so a layout can never be
 *     the only line of defence.
 *   - The redirect target is generic and reveals nothing about who the admin is
 *     or whether an admin mapping is configured.
 */
export const DASHBOARD_LOGIN_PATH = "/login";

/**
 * Redirects the request to the login page unless it is proven to belong to the
 * configured admin. Returns `void` when the caller is authorized.
 */
export async function requireAdmin(): Promise<void> {
  // Stop prerendering: the decision depends on the caller's cookie.
  await connection();

  if (await isAdminUser()) {
    return;
  }

  redirect(DASHBOARD_LOGIN_PATH);
}
