/** Admin dashboard page — protected server-side.
 *
 * This route is PROTECTED using the authenticateAdmin wrapper from
 * app/auth/adminAuth. Unauthenticated or non-admin requests receive
 * a 401/403 response before the page component renders.
 *
 * @see app/auth/adminAuth.tsx for the authenticateAdmin pattern
 */

import { authenticateAdmin } from "../auth/adminAuth";

// ---------------------------------------------------------------------------
// Page default export — the UI shown when /admin is accessed.
// Shown only after admin authentication passes.
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  return (
    <section className="p-6">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Admin Dashboard
      </h1>
      <p className="text-muted">
        Welcome to the private administration area. This route is protected
        server-side: only the configured admin (after running
        UPDATE public.admin_identity SET admin_user_id = …) can access it.
      </p>
      <ul className="list-disc pl-4 mt-4 text-sm">
        <li>Navigate via the sidebar to manage Heroes, Skins, Appearance, Releases</li>
        <li>All CRUD operations are server-side only; this page is the shell</li>
        <li>Configure the admin mapping after creating the admin user in Supabase Auth</li>
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Route handler — server-side admin protection.
// authenticateAdmin wraps this and checks the session + is_admin() DB function.
// Returns 401 if no session, 403 if not admin, proceeds only for the admin.
// ---------------------------------------------------------------------------

export const GET = authenticateAdmin(async () => {
  return new Response(
    `
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Admin Dashboard
      </h1>
      <p className="text-muted">
        Welcome to the private administration area. This route is protected
        server-side: only the configured admin (after running
        UPDATE public.admin_identity SET admin_user_id = …) can access it.
      </p>
      <ul className="list-disc pl-4 mt-4 text-sm">
        <li>Navigate via the sidebar to manage Heroes, Skins, Appearance, Releases</li>
        <li>All CRUD operations are server-side only; this page is the shell</li>
        <li>Configure the admin mapping after creating the admin user in Supabase Auth</li>
      </ul>
    `,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    }
  );
});