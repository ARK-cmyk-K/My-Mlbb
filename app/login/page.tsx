import type { Metadata } from "next";
import Link from "next/link";

import { sanitizeRedirectTarget } from "../auth/access-policy";
import { LoginForm } from "./login-form";

/**
 * Admin sign-in page (task 02-01).
 *
 * Public route: it is intentionally reachable without a session (that is the
 * point of a login page) but it is excluded from search indexes and reads no
 * privileged data. The `redirectTo` query parameter is validated before it is
 * echoed into the form, so it cannot be used as an open redirect.
 */

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

// Reading `searchParams` blocks on the request; opt out of Cache Components
// instant-navigation validation for this route (see the authentication guide).
export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const redirectTo = sanitizeRedirectTarget(params.redirectTo);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-24">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Admin sign in
        </h1>
        <p className="mt-2 text-sm text-muted">
          This dashboard is private. Sign in with the configured administrator
          account to continue.
        </p>

        <div className="mt-8 flex w-full justify-center">
          <LoginForm redirectTo={redirectTo} />
        </div>

        <Link
          href="/"
          className="mt-8 text-sm text-muted transition-colors hover:text-foreground"
        >
          ← Back to the public site
        </Link>
      </div>
    </div>
  );
}
