"use server";

import { redirect } from "next/navigation";

import { sanitizeRedirectTarget } from "../auth/access-policy";
import { createSupabaseServerClient } from "../lib/supabase/server";

/**
 * Admin authentication server actions (task 02-01).
 *
 * All authentication happens on the server, in these Server Actions — never in
 * client code. Errors returned to the browser are deliberately generic so an
 * attacker cannot tell a wrong password from a missing account, an unconfigured
 * project, or a network failure. Details are not echoed back.
 */

export interface SignInState {
  /** Generic, human-readable error; absent on the initial render. */
  error?: string;
}

const GENERIC_SIGN_IN_ERROR = "Invalid email or password.";

export async function signInAction(
  _previousState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = sanitizeRedirectTarget(formData.get("redirectTo"));

  if (email.length === 0 || password.length === 0) {
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    // Auth is not configured yet. Report the same generic failure so the state
    // of the deployment is not disclosed to an unauthenticated caller.
    console.error(
      "signInAction: Supabase is not configured; sign-in is unavailable."
    );
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  // `redirect` throws to unwind; call it outside any try/catch.
  redirect(redirectTo);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if revocation fails, send the operator back to the login page.
    }
  }

  redirect("/login");
}
