/**
 * Middleware for next.js to protect routes based on authentication.
 *
 * This runs on the edge before the request reaches your pages/app.
 * It does NOT perform full authorization (that's done in route handlers),
 * but it can redirect unauthenticated users to a login page.
 *
 * For admin-only routes, the actual authorization check must happen
 * in the route handler using authenticateAdmin() or isAdminUser().
 *
 * To use: add to next.config.ts: `middleware: ['auth']`
 *
 * NOTE: This middleware requires NEXT_RUNTIME=edge or nodejs edge setup.
 * For now, the primary protection is in route handlers (authenticateAdmin).
 */

// export const config = {
//   matcher: [
//     '/admin/:path*',
//     '/dashboard/:path*',
//     '/api/admin/:path*',
//     '/api/dashboard/:path*',
//   ],
// };

// export default async function auth middleware(req: Request) {
//   const supabase = createServerClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
//     {
//       cookies: {
//         get(name: string) {
//           const cookie = req.cookies[name];
//           return cookie || undefined;
//         },
//       },
//     }
//   );

//   const {
//     data: { session },
//     error: authError,
//   } = await supabase.auth.getSession();

//   // If supabase auth returns an error or no session, redirect to login
//   if (authError || !session) {
//     // Preserve the original URL as a redirect target after login
//     const url = new URL("/login", req.url);
//     url.searchParams.set("redirectTo", req.nextUrl.pathname);
//     return Response.redirect(url);
//   }

//   // Session exists — let the request proceed
//   // Authorization (is admin?) is handled in the route handler
//   return NextResponse.next();
// }