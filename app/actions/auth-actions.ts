"use server";

import { redirect } from "next/navigation";

/**
 * Server-side logout action for the admin.
 * Redirects to the login page after clearing the session.
 */
export async function handleLogout() {
  "use server";
  redirect("/login");
}