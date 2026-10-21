# Supabase Migration Application Guide
## MLBB Showcase — Manual SQL Editor Steps

> **Important**: To avoid SQL Editor formatting issues, **download each .sql file directly**
> from the `supabase/migrations/` folder rather than copying from this markdown guide.
> If you must copy from markdown, be extra careful with quote escaping.

---

## 📥 Step 0: Download Migration Files (Recommended)

1. In your file explorer, go to:
   `D:\Mlbb\My-Mlbb\supabase\migrations\`
2. **Right-click each file → Save As** — this preserves exact SQL formatting
3. The 4 migration files are:
   - `20261019104827_core_schema.sql`
   - `20261019113245_rls_grants_and_policies.sql`
   - `20261019140000_published_search_rpc_and_indexes.sql`
   - `20261019160000_storage_buckets_and_policies.sql`

> **Do not copy from this markdown guide** — the markdown formatting can introduce
> quote escaping issues (`'` vs `"`) and dash formatting problems (`--` vs `---`).
> Save the files directly from the filesystem.

---

## 🗡️ Step 1: Open Supabase SQL Editor

1. Go to https://supabase.com/dashboard → your project
2. Click **SQL Editor** in the left sidebar
3. Click **New Query** (top right button)

---

## 📦 Step 2: Apply Migration 1 — Core Schema

**File**: `20261019104827_core_schema.sql`

1. Open the saved `.sql` file in a text editor (Notepad, VS Code, etc.)
2. **Select all → Copy** the entire content
3. **Paste** into the SQL Editor query window
4. **Click Run** (▶️ button)
5. Wait 10-30 seconds — this creates all tables, enums, RLS, and seed data

**Expected**: Query completes successfully. You may see informational notes about existing objects if some data was already seeded.

---

## 🔐 Step 3: Apply Migration 2 — RLS and Grants

**File**: `20261019113245_rls_grants_and_policies.sql`

1. Open the saved `.sql` file
2. **Select all → Copy** entire content
3. **Paste** into SQL Editor new query window
4. **Click Run**

**What this does** (security foundation — run with admin privileges):

- `GRANT USAGE` + `REVOKE CREATE` on `public` schema
- `ALTER DEFAULT PRIVILEGES IN SCHEMA public` — revokes `anon`/`authenticated` from new tables
- `ALTER DEFAULT PRIVILEGES IN SCHEMA storage` — revokes from storage tables  
- `REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated` — per-function deny
- Creates `public.is_admin()` function (SECURITY DEFINER, fails closed)
- Creates `public.admin_identity` singleton (admin_user_id NULL by default)
- Row-level security policies on all 15 tables

**Expected**: Query succeeds. This is the most critical security migration.

---

## 🔍 Step 4: Apply Migration 3 — Search RPC and Indexes

**File**: `20261019140000_published_search_rpc_and_indexes.sql`

1. Open the saved `.sql` file
2. **Select all → Copy** entire content
3. **Paste** into SQL Editor new query window
4. **Click Run**

**What this creates**:
- RPC function `public.search_heroes(text)` — GIN trigram search
- RPC function `public.search_skins(text)` — GIN trigram search
- GIN indexes on `heroes` using `trgm` extension
- GIN indexes on `skins` using `trgm` extension
- GIN index on `media` using `path` for path lookups
- Proper EXECUTE grants for anon role

**Expected**: Query succeeds. Indexes will be used by the search functionality.

---

## 📦 Step 5: Apply Migration 4 — Storage Buckets and Policies

**File**: `20261019160000_storage_buckets_and_policies.sql`

1. Open the saved `.sql` file
2. **Select all → Copy** entire content
3. **Paste** into SQL Editor new query window
4. **Click Run**

**What this creates** (task 02-04):

- Two storage buckets:
  - `showcase-public` (`public = true`) — 10 MiB, allows png/jpeg/webp/avif
  - `showcase-draft` (`public = false`) — 10 MiB, same MIME types
- **8 storage.objects policies**:
  - `public-bucket SELECT` for `anon`/`authenticated`
  - `draft` SELECT/INSERT/UPDATE/DELETE for `authenticated` **only when `public.is_admin()`**
  - `public-bucket INSERT/UPDATE` require existing `public.media` row
  - `public-bucket DELETE` for admin cleanup
- Object names must match: `^<kind>/<uuid>\.(png|jpg|webp|avif)$`
- **Important**: The migration has a guarded `DO` block — may show a NOTICE if storage tables
  are absent. This is **expected and OK** — the migration is idempotent.

**Expected**: May show a NOTICE about the guarded block — this is normal. Do not be alarmed.

---

## 🔍 Step 6: Verify All Migrations

After running all 5 steps, run these verification queries in the SQL Editor:

### 6.1 Check Migration List

```sql
SELECT * FROM supabase_migrations.schema_migrations 
ORDER BY id;
```

Should show 4 migration versions applied.

### 6.2 Check Key Tables

```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

Should include: heroes, skins, account_stats, achievements, timeline_entries,
appearance_settings, homepage_sections, media, releases, release_snapshots,
published_heroes, published_skins, published_achievements, published_timeline_entries.

### 6.3 Check Account Stats

```sql
SELECT * FROM public.account_stats WHERE id = 1;
```

Should return 1 row (the singleton).

### 6.4 Check Homepage Sections

```sql
SELECT * FROM public.homepage_sections;
```

### 6.5 Check RLS Status

```sql
SELECT relname, rowsecurity FROM pg_class 
WHERE relname IN ('heroes','skins','account_stats');
```

`rowsecurity` should be `true`.

### 6.6 Check Storage Buckets

In Supabase Dashboard → **Storage**:
- Should see `showcase-public` (public = true)
- Should see `showcase-draft` (public = false)

---

## 📊 Step 7: Seed Essential Data

Migrations create the schema; you need to populate data.

### 7.1 Homepage Sections

```sql
INSERT INTO public.homepage_sections (section_id, position, is_enabled)
VALUES 
  ('spotlight', 1, true),
  ('stats', 2, true),
  ('showcase_tabs', 3, true),
  ('timeline', 4, true),
  ('explorer', 5, true);
```

### 7.2 Account Stats Row

```sql
INSERT INTO public.account_stats (id, display_name, total_matches, win_rate, rank_label, highest_rank_label)
VALUES (1, 'MLBB Champion', 247, 0.78, 'Mythic', 'Predator');
```

### 7.3 Published Hero (minimum for 05-02)

```sql
INSERT INTO public.published_heroes (
  id, name, slug, primary_role, secondary_role, portrait_media_id,
  total_matches, win_rate, is_signature, is_favorite, published_at
)
VALUES (
  gen_random_uuid(), 
  'Link', 
  'link', 
  'Carry', 
  NULL, 
  'medias/hero-link-uuid.png',  -- object must exist in showcase-public bucket
  1280, 
  0.74, 
  true, 
  false, 
  now()
);
```

**Important**: The `portrait_media_id` must correspond to an actual object in your
`showcase-public` storage bucket. Upload a test image via the Dashboard first, then
use its filename (just the UUID part, without the `showcase-public/` prefix) as the
value.

### 7.4 Verify Seed Data

```sql
SELECT * FROM public.account_stats;
SELECT * FROM public.homepage_sections LIMIT 5;
SELECT * FROM public.published_heroes LIMIT 3;
```

---

## 🏃 Step 8: Publish a Release (for 05-02 Full Test)

The public homepage reads from the **published release**, not draft tables.

### 8.1 Insert Release Snapshot

```sql
INSERT INTO public.release_snapshots (release_id, payload, payload_format_version, checksum_sha256, version)
SELECT 
  gen_random_uuid()::text,
  (SELECT jsonb_build_object(
    'heroes', (SELECT array_to_jsonb(array_agg(row_to_json(h))) FROM (SELECT * FROM published_heroes) h),
    'skins', (SELECT array_to_jsonb(array_agg(row_to_json(s))) FROM (SELECT * FROM published_skins) s),
    'account_stats', (SELECT row_to_json(a) FROM account_stats a WHERE id = 1),
    'homepage_sections', (SELECT array_to_jsonb(array_agg(row_to_json(hs))) FROM (SELECT * FROM homepage_sections) hs),
    'version', 1
  ),
  1,
  md5(random()::text),
  1
WHERE NOT EXISTS (SELECT 1 FROM release_snapshots LIMIT 1);
```

### 8.2 Update Releases Row

```sql
INSERT INTO public.releases (id, status, published_at, source_snapshot_id)
VALUES (
  (SELECT COALESCE((SELECT release_id FROM release_snapshots ORDER BY version DESC LIMIT 1), gen_random_uuid()::text)),
  'published',
  now(),
  (SELECT MAX(id) FROM release_snapshots)
)
ON CONFLICT (id) DO UPDATE SET status = 'published', published_at = now(), source_snapshot_id = EXCLUDED.source_snapshot_id;
```

### 8.3 Verify Publish Success

```sql
SELECT * FROM public.releases WHERE status = 'published';
SELECT * FROM public.release_snapshots ORDER BY version DESC LIMIT 3;
SELECT count(*) FROM published_heroes;
SELECT count(*) FROM published_skins;
```

---

## 🌐 Step 9: Test the Public Homepage

### 9.1 Deploy or Run

- **Deploy** to Vercel/Netlify with `.env.local` variables set
- **Or** run locally if Docker is available (`npx supabase start` + `npm run dev`)
- **Or** just visit the URL — the code falls back to placeholder UI if no published release

### 9.2 Expected Result — Fully Set Up

Visit `http://your-url/` and you should see:

```
┌─────────────────────────────────────┐
│  ▲  [Hero image from showcase-public bucket]    │
│  Link                                       │
│  •••                                        │
│  Total Matches: 1,280                       │
│  Win Rate: 74.0%                            │
│  Rank: Mythic                               │
│  Highest: Predator                          │
│                                           │
│  Account: MLBB Champion                     │
│  Total Matches: 247                         │
│  Win Rate: 78.0%                            │
│  Rank: Mythic                               │
│  Highest: Predator                          │
│                                           │
│  Collection                                 │
│  — Hero & skin collection data pending      │
└─────────────────────────────────────┘
```

### 9.3 Fallback States (All OK)

- **"Spotlight header & stats strip — loading…"** — No published release yet
- **"Spotlight header — loading…"** / **"Stats strip — loading…"** — Temporary issue
- Empty states if no heroes/sections seeded (also fine initially)

---

## ✅ Step 10: Update PROJECT_STATE.md

After verification, update:

```markdown
## Phase summary
| Phase | Scope | Status |
|---|---|---|
| 5 | Public showcase, navigation, explorer, comparison, favorites and sharing | VERIFIED (`05-01` implemented, `05-02` verified) |
```

Add the 05-02 task entry with evidence of successful data rendering.

---

## ⚠️ Troubleshooting — Common SQL Editor Issues

| Error | Cause | Fix |
|-------|-------|-----|
| "syntax error at end of input" | Incomplete SELECT/INSERT — missing comma or paren | Check the SQL Editor output for the exact line |
| "permission denied" | Running as anon, not admin | Use the project's `service_role` key in the SQL Editor (temporarily), or ensure you're the project owner |
| "function already exists" | Migration re-run | Some functions/idempotent; ignore or use `DROP FUNCTION IF EXISTS` first |
| "column count does not match" | INSERT has wrong number of columns | Match the column list exactly with the table schema |
| "invalid input for type uuid" | portrait_media_id format wrong | Use just the UUID filename, e.g. `a1b2c3d4-e5f6-7g8h-9i10-jk1l1m1n1o1p` |
| NOTICE about guarded block (Migration 4) | Storage tables may not exist yet | **This is OK** — the migration handles this gracefully |

---

## ⚠️ Critical — Quote Escaping Warning

> **The #1 cause of errors when copying SQL from markdown is quote escaping.**

- SQL uses single quotes `'` for string literals: `'hello'`
- Markdown uses double quotes `"` for code blocks, and single quotes can trigger markdown formatting
- **Best practice**: Always **download the .sql files directly** from `supabase/migrations/`
- **If copying from markdown**: 
  - Check that every `'` in the SQL is a literal single quote, not a markdown artifact
  - Replace any `" "` in the SQL with `' '` if needed
  - Make sure `--` comments aren't being interpreted as markdown horizontal rules

---

## ✅ Final Checklist — Print This

- [ ] Step 0: Downloaded all 4 .sql files from `supabase/migrations/`
- [ ] Step 1: Migration 1 run in SQL Editor (core schema)
- [ ] Step 2: Migration 2 run in SQL Editor (RLS + grants)
- [ ] Step 3: Migration 3 run in SQL Editor (search RPC + indexes)
- [ ] Step 4: Migration 4 run in SQL Editor (storage buckets + policies) — NOTICE OK
- [ ] Step 5: Verification queries pass (tables, RLS, account_stats, sections)
- [ ] Step 6: Homepage sections seeded (spotlight + stats enabled)
- [ ] Step 7: Account stats row inserted (id=1)
- [ ] Step 8: At least 1 published hero with valid portrait_media_id
- [ ] Step 9: Release published (releases row status = 'published')
- [ ] Step 10: Public homepage (`/`) renders spotlight header + stats strip
- [ ] Step 11: `PROJECT_STATE.md` updated to `VERIFIED` for 05-02

---

*Guide created: 2026-10-20 — Direct file download recommended to avoid markdown/SQL formatting conflicts*