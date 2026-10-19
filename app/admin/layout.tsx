import type { Metadata } from "next";

import { requireAdmin } from "../auth/requireAdmin";
import { DashboardChrome } from "./dashboard-chrome";

/**
 * Private dashboard shell (task 02-02).
 *
 * Authorization happens HERE, on the server, before any chrome or page renders:
 * `requireAdmin()` redirects every request that is not the configured admin.
 * Each dashboard page calls it again so the check also sits next to the data.
 *
 * The layout only composes presentation; it reads no user data and exposes no
 * privileged configuration to the browser.
 */

// Admin routes are private: keep them out of search indexes. This is not an
// authorization control — `requireAdmin()` is.
export const metadata: Metadata = {
  title: "Dashboard · MLBB Showcase",
  robots: { index: false, follow: false },
};

// The dashboard deliberately blocks on the server to authorize the request, so
// opt this segment out of Cache Components instant-navigation validation (see
// the "Authentication with Cache Components" guide).
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return <DashboardChrome>{children}</DashboardChrome>;
}
