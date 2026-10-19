# Task 01-04 — RLS, Grants, and Storage Security Foundations

Read the master protocol, architecture decisions, current project state, and schema migrations. Confirm the actual table and column names before writing policies.

Implement least-privilege grants and Row Level Security policies that preserve strict public/draft separation. Anonymous users must read only deliberately published records and safe public release data. Drafts, admin settings, private media metadata, backup records, and release-management operations must not be exposed publicly. Restrict writes to the authenticated designated admin, with authorization enforced in the database and server-side code where applicable.

If single-admin identity mapping is not yet configured, create a documented secure configuration pattern and fail closed; do not invent an admin UUID or grant every authenticated user access. Do not create permissive policies on private tables. Include policy comments and tests or SQL verification queries for anon, ordinary authenticated, and admin access.

Acceptance criteria: policy intent and grants are reviewed table-by-table; tests/checks and any required manual Supabase setup are recorded. Update `PROJECT_STATE.md` and `PROMPT_INDEX.md`.
