# Task 01-06 — Phase 1 Validation and Migration Documentation

## Overview

This task validates and documents the Phase 1 foundation for the MLBB Showcase application. It covers migration validation, security configuration, and setup procedures.

## ✅ Completed Validation

### Lint / Typecheck / Build

| Check | Command | Result |
|---|---|---|
| `npm run lint` | `npx eslint` | exit 0 |
| `npm run typecheck` | `next typegen && tsc --noEmit` | exit 0 |
| `npm run build` | `next build` | exit 0 (static `/` + `/_not-found`) |

### Migration Status

| Migration | Version | Status |
|---|---|---|
| `20261019104827_core_schema` | `20261019104827` | Applied locally |
| `20261019113245_rls_grants_and_policies` | `20261019113245` | Applied locally |
| `20261019140000_published_search_rpc_and_indexes` | `20261019140000` | Applied locally |

### Function Grant Pattern (01-04/01-06 Checklist)

Every new function must follow this pattern after creation:

```sql
-- Step 1: Remove default PostgreSQL PUBLIC EXECUTE grant
-- (ALTER DEFAULT PRIVILEGES cannot remove the built-in PUBLIC EXECUTE;
--  it is merged with pg_default_acl and must be revoked explicitly)
REVOKE EXECUTE ON FUNCTION <schema>.<function>(<args>) FROM PUBLIC, anon;

-- Step 2: Grant EXECUTE only to intended roles
GRANT EXECUTE ON FUNCTION <schema>.<function>(<args>) TO anon;
```

**Applied to:** `public.search_published_content(text, integer)` — `REVOKE EXECUTE FROM PUBLIC, anon` then `GRANT EXECUTE TO anon`.

### RLS Status on All Tables

All 15 public tables have `ENABLE ROW LEVEL SECURITY`:

```
account_stats, achievements, admin_identity, appearance_settings,
heroes, homepage_sections, media,
published_achievements, published_heroes, published_skins,
published_timeline_entries, release_snapshots, releases,
skins, timeline_entries
```

### Residual Gaps (documented for awareness)

| Gap | Description | Owner |
|---|---|---|
| (a) | `ALTER DEFAULT PRIVILEGES` does **not** enable RLS — every newly created table must be given `ENABLE ROW LEVEL SECURITY` explicitly before it is granted anything. | Documented checklist item; all existing tables already have RLS enabled. |
| (b) | PostgreSQL's built-in `PUBLIC EXECUTE` on functions cannot be revoked at default level. Every new function/RPC must run `REVOKE EXECUTE … FROM PUBLIC, anon` immediately after creation, then grant only the intended roles. | Fixed for `search_published_content` in `01-05` migration; carry forward to `04-06` and beyond. |

### Storage Security Foundation

**Status:** Skipped in `01-04` because the local sandbox lacks `storage.buckets`/`storage.objects` service tables.

**Manual re-application required in `02-04`:** Re-apply the guarded storage foundation from `20261019113245_rls_grants_and_policies.sql` §8:

```sql
-- If storage tables exist:
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE storage.buckets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE storage.objects FROM anon;
```

**Note:** `anon` SELECT on `storage.objects` is left untouched for `02-04` to review public-bucket read behaviour.

### Theme Tokens (from `01-02`)

- **Dark-first semantic token set** in `app/globals.css`:
  - `background`, `surface`, `surface-raised`, `foreground`, `muted`, `border`, `border-strong`, `focus`, `primary`, `secondary`
  - Rarity accents: `gold`, `purple`, `blue`, `emerald` — each with `-soft` and `-text` variants
- **Theme switching** via `data-theme` attribute on `<html>` + `prefers-color-scheme`
- **Chakra Petch** (`--font-heading`) for display / **Inter** (`--font-body`) for body
- **Tailwind 4 `@theme inline`** mappings: `bg-background`, `text-muted`, `text-accent-gold`, `font-display`, etc.
- **No toggle UI yet** — deferred to `04-01`/`05-01`

### Public vs. Draft Access Verification

| Accessor | Reads | Writes |
|---|---|---|
| `anon` | `published_*` tables (USING true), `published_media` view, `published_release` view, safe columns of `media`/`releases` (RLS-filtered) | None |
| `authenticated` (unconfigured) | Same public reads + DML on working tables only when `is_admin()` is true | None (fails closed) |
| `authenticated` (configured admin) | Full access to draft working set (`is_admin()` policies) + public reads | Full CRUD on working tables + publish/rollback |
| `service_role` | Bypasses RLS, reads all tables | Server-side operations only |

**Verification procedure (local Supabase Postgres):**

```sql
-- As anon, verify only public reads:
SELECT count(*) FROM public.published_heroes;      -- should work
SELECT count(*) FROM public.heroes;                -- 42501 (RLS denied)

-- Verify is_admin() fails closed:
SELECT public.is_admin();                           -- false (admin_user_id is NULL)

-- Verify RLS on a draft table:
SET ROW SECURITY ON public.heroes;
SELECT count(*) FROM public.heroes WHERE true;      -- 0 (no policy matches non-admin)
```

## 📋 Phase 1 Checklist (pass/fail/skipped)

| Task | Status | Evidence |
|---|---|---|
| `01-01` Project audit and bootstrap | VERIFIED | Repo audit; Next.js 16.4.2 scaffold; lint/typecheck/build all exit 0; secret scan clean |
| `01-02` Design tokens and typography | VERIFIED | `app/globals.css` with dark-first tokens; both theme paths; focus/ reduced-motion rules; lint/typecheck/build exit 0 |
| `01-03` Core database schema migration | VERIFIED | 14 tables, 8 enums, RLS on all tables, CHECK constraints, seed data; verification: 30 PASS rolled back |
| `01-04` RLS, grants, and storage security foundations | VERIFIED | 143/143 assertions PASS (rolled back); structural: RLS on 15/15 tables; grant matrix; anon/origin/authenticated/service_role behaviour |
| `01-05` Published-content search RPC and indexes | VERIFIED | Function created; GIN trigram indexes; grant pattern: `REVOKE EXECUTE FROM PUBLIC, anon` then `GRANT TO anon`; lint/typecheck/build exit 0 |
| `01-06` Phase 1 validation and migration documentation | IN_PROGRESS | This document; lint/typecheck/build exit 0; migration grant pattern fixed; unresolved: manual verification for hosted project, storage re-application |

## 🔧 Local Migration Commands

```bash
# Install dependencies
npm ci

# Run lint
npm run lint

# Run typecheck
npm run typecheck

# Build static app
npm run build

# Supabase migration up (applies pending migrations from supabase/migrations/)
npx supabase migration up

# Supabase migration status
npx supabase migration list  # (requires linked project; use Docker exec as fallback)

# Supabase db reset (fails in this sandbox; see risks)
#   → Workaround: pre-init volume with postgres:17.11 image, then `supabase migration up`
```

## 🗄️ Supabase Project Configuration (local)

- **CLI version:** 2.121.0 (via `npx supabase`)
- **Local Docker stack:** `public.ecr.aws/supabase/postgres:17.11.0.004`, container `supabase_db_My-Mlbb`, port `54322`
- **Configuration:** `supabase/config.toml` — `api.auto_expose_new_tables = false` (deny-by-default for future tables)
- **No hosted project:** Schema was applied locally only; nothing was pushed to a cloud database
- **Migrations tracked in:** `supabase_migrations.schema_migrations` table
- **pg_trgm extension:** Must be installed (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`) for GIN trigram indexes on `published_*` tables

## 🛡️ Security Notes — Non-negotiable

- Never expose Supabase service-role keys, secrets, private storage paths, or privileged server configuration to the browser
- All browser input is untrusted; validated at server boundaries and in the database
- Anonymous access reads only intentionally published data; drafts and admin metadata are protected by RLS
- Hiding a button or route is **not** authorization — RLS and database grants enforce it
- `is_admin()` fails closed when `admin_identity.admin_user_id` is NULL — no dashboard write path works until an operator configures the mapping after `02-01`
- Every new function must have `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon` after creation (PostgreSQL built-in PUBLIC EXECUTE limitation)
- Every new table must have `ENABLE ROW LEVEL SECURITY` explicitly (ALTER DEFAULT PRIVILEGES does not enable RLS)

## ⚠️ Known Issues / Blockers

| Issue | Reason | Manual Verification |
|---|---|---|
| `supabase db reset` fails | 2-CPU sandbox pg connection timeout; CLI prunes volume on failure | Retry on faster hardware or run `supave migration up` after pre-initialising the volume |
| Storage bucket/object policies | `storage.buckets`/`storage.objects` absent in this sandbox | Re-apply the guarded storage foundation from `01-04` §8 when service schemas initialise (`02-04`) |
| `npx supabase db reset` + service migrations | Same timeout issue; service tables (storage, realtime) not fully initialised | Manual grant/revoke steps via psql against the running Docker container |
| No hosted Supabase project | Verification done locally only; RLS policies are "locally verified only" | Re-run `supabase/tests/01-04_rls_grants_verification.sql` against a hosted project before `06-05` |

## 📝 Next Safe Tasks

Per `PROMPT_INDEX.md` phase order:

1. `02-01` — Secure single-admin authentication (needs hosted Supabase or fully initialised local stack for auth testing; afterwards configure `admin_identity.admin_user_id` mapping)
2. `02-02` — Protected dashboard shell and sidebar
3. `02-04` — Supabase Storage buckets and policies (re-apply the storage foundation from `01-04` §8 first)