# Task 02-01 — Secure Single-Admin Authentication

Read the master protocol, project state, architecture decisions, and existing Supabase/auth code.

Implement the single-admin login and session lifecycle using supported Supabase Auth patterns for the current Next.js version. Protect server routes and server actions with server-side authorization; do not rely on client route guards alone. Use secure cookie/session handling, safe redirects, generic authentication errors, logout, and a documented optional 2FA path if supported by the configured provider.

Admin eligibility must come from a secure server/database configuration, not a public environment variable or user-editable profile field. Never expose service-role credentials to client code. Add tests for unauthenticated access, non-admin access, session expiry, and logout where feasible.

If provider settings or credentials are missing, implement only safe repository-level work and record setup steps. Update project state.
