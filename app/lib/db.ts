/**
 * Database-level authorization helpers for the MLBB Showcase.
 *
 * These functions are server-side only and rely on Supabase's
 * server-side capabilities. They must never be called from client
 * components.
 *
 * Key design: is_admin() is a PostgreSQL SECURITY DEFINER function that
 * fails closed. It returns true ONLY when auth.uid() matches the single
 * admin_user_id configured in public.admin_identity. Until an operator
 * configures the mapping (task 02-01 step), is_admin() is false for everyone.
 */

// Placeholder: in production, isAdminUser would call public.is_admin()
// via the Supabase Admin SDK or a direct RPC call from an edge function
// or server action with the service_role cookie/header.
//
// Example (via Supabase rpc):
//   const { data } = await supabase.rpc("is_admin");
// Example (via service_role):
//   const { data } = await supabaseAdmin.rpc("is_admin");

/**
 * Checks whether the given user ID is the single configured admin.
 *
 * Returns false until the admin_identity mapping is configured.
 * In a full implementation, this queries the database directly.
 */
export function isAdminUser(): boolean {
  return false;
}

/**
 * Verifies that the admin identity mapping is configured.
 * Returns true if admin_identity has a non-NULL admin_user_id.
 */
export function isAdminMappingConfigured(): boolean {
  return false;
}

/**
 * Error messages — all generic, never reveal internal state.
 */
export const AuthErrors = {
  UNAUTHENTICATED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  ADMIN_REQUIRED: "Admin privileges required",
  CONFIGURATION_REQUIRED: "System configuration required",
} as const;

/**
 * Returns a standardized error response for unauthenticated callers.
 */
export function authErrorResponse(
  messageKey: keyof typeof AuthErrors
): Response {
  return new Response(AuthErrors[messageKey], {
    status:
      messageKey === "UNAUTHENTICATED"
        ? 401
        : messageKey === "FORBIDDEN"
        ? 403
        : 500,
  });
}