# PROJECT STATE — MLBB Showcase

> This file is the persistent cross-session record. Update it after every implementation task. Do not claim completion without evidence.

## Project summary
- **Goal:** Premium public MLBB account showcase plus a secure private single-admin dashboard.
- **Approved stack:** Next.js App Router, TypeScript, Tailwind CSS, Framer Motion, Supabase PostgreSQL/Auth/Storage, Vercel, `@vercel/og`.
- **Current phase:** Phase 1 — Project Setup & Database Foundations.
- **Current task:** None assigned.
- **Last updated:** Not yet initialized by an implementation agent.

## Status definitions
- `NOT_STARTED` — work has not begun.
- `IN_PROGRESS` — work is underway.
- `BLOCKED` — prerequisite, decision, or environment prevents safe progress.
- `IMPLEMENTED_UNVERIFIED` — changes exist, but acceptance criteria are not fully verified.
- `VERIFIED` — acceptance criteria checked with recorded evidence.

## Phase summary
| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, design tokens, Supabase schema, RLS, search RPC | NOT_STARTED |
| 2 | Authentication, dashboard shell, draft/published engine, storage policies | NOT_STARTED |
| 3 | Hero/skin CRUD, CSV import, exports and media manifest | NOT_STARTED |
| 4 | Appearance studio, preview, release publishing, snapshots and rollback | NOT_STARTED |
| 5 | Public showcase, navigation, explorer, comparison, favorites and sharing | NOT_STARTED |
| 6 | Global search, social cards, optimization, security testing and launch | NOT_STARTED |

## Task ledger
| Task ID | Title | Status | Evidence / notes |
|---|---|---|---|
| — | No task executed yet | NOT_STARTED | Initialize this ledger after inspecting the repository. |

## Current architecture and environment
- Repository inspected: No
- Existing app framework/version: Unknown
- Package manager: Unknown
- Supabase project configured: Unknown
- Environment variables configured: Unknown (never record secret values here)
- Migrations applied: Unknown
- Deployment configured: Unknown

## Verified evidence
No checks recorded yet.

## Blockers and risks
- Inspect repository before choosing setup commands; do not overwrite an existing app.
- Supabase credentials/project availability must be checked without exposing secret values.
- Draft/published isolation must be designed before public queries or admin mutation endpoints are implemented.

## Change log
- Initial tracker template created. No implementation work is implied by this entry.

## Next recommended tasks
1. `01-01` — Project audit and bootstrap.
2. `01-02` — Design tokens and typography.
3. `01-03` — Database schema migration.
4. `01-04` — RLS, grants, and storage security foundations.
5. `01-05` — Published-content search RPC and search indexes.
