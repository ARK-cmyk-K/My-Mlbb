import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  DASHBOARD_HOME,
  sanitizeRedirectTarget,
} from "./app/auth/access-policy";
import { readSupabaseConfig } from "./app/lib/supabase/config";

/**
 * Root Proxy (task 02-01).
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy`; this replaces
 * the commented-out `app/middleware.ts` scaffold.
 *
 * It has two jobs, both *optimistic* — the authoritative check still happens in
 * `app/lib/db.ts` (`isAdminUser()`), close to the data, on every page:
 *
 *   1. Refresh the Supabase session cookie so a returning admin's token does
 *      not expire mid-session. This only runs when an auth cookie is present,
 *      so anonymous traffic and public pages pay nothing for it.
 *   2. Redirect unauthenticated requests for `/admin*` to `/login`, preserving
 *      the intended destination in a validated `redirectTo` parameter.
 *
 * When Supabase is not configured this fails closed: `/admin*` still redirects
 * to `/login` and public routes are untouched.
 */

function isDashboardPath(pathname: string): boolean {
  return (
    pathname === DASHBOARD_HOME || pathname.startsWith(`${DASHBOARD_HOME}/`)
  );
}

function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("auth-token"));
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set(
    "redirectTo",
    sanitizeRedirectTarget(request.nextUrl.pathname)
  );
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The login page itself never needs a session check or a refresh.
  if (pathname === "/login") {
    return NextResponse.next();
  }

  const config = readSupabaseConfig(process.env);

  if (!config || !hasAuthCookie(request)) {
    // Nothing to refresh. Gate the dashboard, leave public routes alone.
    return isDashboardPath(pathname)
      ? redirectToLogin(request)
      : NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Revalidates the token with the Auth server and refreshes it if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isDashboardPath(pathname) && !user) {
    return redirectToLogin(request);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on application routes only. Skip Next.js internals, the favicon and
     * common static asset extensions so proxy never blocks CSS/JS/images.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|css|js|map|woff|woff2)$).*)",
  ],
};
