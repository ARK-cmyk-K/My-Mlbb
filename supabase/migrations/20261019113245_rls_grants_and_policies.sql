-- ============================================================================
-- Migration: 20261019113245_rls_grants_and_policies
-- Task:      01-04 — RLS, Grants, and Storage Security Foundations (MLBB)
-- Author:    implementation agent, 2026-10-19
--
-- PURPOSE
-- Builds on 20261019104827_core_schema (RLS enabled + zero policies + explicit
-- REVOKEs + no GRANTs) and adds the actual authorization layer:
--   1. schema-level and ALTER DEFAULT PRIVILEGES hardening, so tables and
--      sequences created later are deny-by-default for client roles (new
--      functions still need an explicit per-function revoke — see section 1);
--   2. a documented single-admin identity mapping that FAILS CLOSED;
--   3. least-privilege GRANTs, table by table;
--   4. explicit RLS policies enforcing the public / draft separation;
--   5. two read-only public views exposing only safe columns of media metadata
--      and of the active release;
--   6. storage security foundations (guarded — the local sandbox has the
--      `storage` schema without service tables; full bucket/object policies
--      belong to task 02-04).
--
-- TRUST ZONES / INTENDED ACCESS MATRIX
--   anon            | SELECT on the four `published_*` projection tables; SELECT
--                   | on a safe column subset of `media` and `releases` filtered
--                   | by RLS to deliberately published / active-release rows;
--                   | SELECT on the public views. Nothing else. No writes.
--   authenticated   | same public reads; full DML on working tables ONLY when
--                   | public.is_admin() is true; no access to `admin_identity`.
--                   | The role is expected to contain only the designated admin
--                   | (02-01 single-admin authentication), but every policy is
--                   | written so an ordinary authenticated user gains nothing.
--   service_role    | server-side only (BYPASSRLS + Supabase default grants):
--                   | publish/rollback transactions (04-06), admin_identity
--                   | configuration, dashboard server routes (02-xx).
--   postgres        | owner / migrations only. Table owners bypass RLS (no FORCE
--                   | ROW LEVEL SECURITY is used anywhere, deliberately).
--
-- ADMIN IDENTITY MAPPING (no UUID is invented in this migration)
-- `public.admin_identity` is a singleton (id = 1) whose `admin_user_id` is NULL
-- until an operator sets it AFTER the single admin user exists (task 02-01):
--     UPDATE public.admin_identity
--        SET admin_user_id = (SELECT id FROM auth.users WHERE email = '...');
-- `public.is_admin()` (SECURITY DEFINER, search_path = '') returns true only
-- when auth.uid() equals that stored id. Unconfigured => nobody is admin
-- (fail closed). The table has RLS enabled with ZERO policies and no client
-- grants, so only the owner / service role can read or rewrite the mapping —
-- an authenticated session cannot grant itself admin, even after login.
--
-- VERIFICATION
-- `supabase/tests/01-04_rls_grants_verification.sql` exercises anon,
-- ordinary authenticated, admin (JWT sub = mapped uid), service_role and
-- structural checks. It runs in one transaction and is rolled back.
--
-- NOT INCLUDED HERE (deliberate)
-- * storage bucket/object policies — task 02-04 (needs initialised service
--   schemas; see the guarded block in section 8).
-- * search RPC and its grants — task 01-05.
-- * app/server-side client code — tasks 02-01 and later.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Schema privileges and deny-by-default future objects
-- ----------------------------------------------------------------------------
-- Client roles need USAGE to reach the public read path, and must never be
-- able to create objects there (PostgreSQL 15+ already withholds CREATE from
-- PUBLIC; the revoke makes that explicit and durable).
GRANT  USAGE ON SCHEMA public TO anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

-- Supabase seeds pg_default_acl so that every table/sequence/function created
-- later by `postgres` in `public` is fully usable by anon and authenticated
-- (verified before this migration: anon had arwdDxtm on tables, X on functions,
-- rwU on sequences). Remove those defaults so future objects start denied and
-- must be granted explicitly (RLS still has to be enabled separately — that is
-- a per-table step recorded as a manual checklist item for 01-06).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, and that
-- built-in grant is MERGED with pg_default_acl entries — ALTER DEFAULT
-- PRIVILEGES cannot remove it (verified: a new function still carries the
-- PUBLIC EXECUTE default). The revoke below still removes anon/authenticated
-- from Supabase's seeded entry. => RULE FOR EVERY NEW FUNCTION (01-05, 04-06):
-- each function must be created with an explicit
--   REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;
-- and only then granted to the roles that may call it. Recorded as a checklist
-- item for task 01-06; this migration follows the rule for is_admin().
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ----------------------------------------------------------------------------
-- 2. Single-admin identity mapping (fail closed)
-- ----------------------------------------------------------------------------
-- Holds at most one row. admin_user_id stays NULL until an operator maps it to
-- the real auth.users id created in 02-01; NULL means "no admin configured"
-- and public.is_admin() then returns false for everybody.
CREATE TABLE public.admin_identity (
  id            smallint PRIMARY KEY DEFAULT 1,
  admin_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_identity_single_row CHECK (id = 1)
);
COMMENT ON TABLE public.admin_identity IS
  'Singleton single-admin identity mapping (task 01-04). admin_user_id is NULL until an operator sets it to the id of the admin user created in 02-01; while NULL, public.is_admin() is false for every caller (fail closed). Deliberately unreadable and unwritable by anon and authenticated: only the table owner and the server-side service role may read or change the mapping.';
COMMENT ON COLUMN public.admin_identity.admin_user_id IS
  'auth.users.id of the single designated administrator. Set only by an operator/service role; deleted automatically (ON DELETE SET NULL) if that user is removed, which immediately revokes admin everywhere.';

CREATE TRIGGER trg_admin_identity_updated_at
  BEFORE UPDATE ON public.admin_identity
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS enabled with ZERO policies: no client role can satisfy a policy.
-- The owner (postgres, no FORCE ROW LEVEL SECURITY) and service_role
-- (BYPASSRLS) are unaffected, which is exactly what is_admin() and the
-- server-side configuration step need.
ALTER TABLE public.admin_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_identity FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_identity FROM PUBLIC;

-- Bootstrap the singleton row with an intentionally NULL mapping.
INSERT INTO public.admin_identity (id) VALUES (1);

-- SECURITY DEFINER so it can read admin_identity (which clients cannot) while
-- being callable from RLS policies. search_path is pinned empty; every object
-- is schema-qualified. Returns false for anon (no subject claim) and for any
-- authenticated user who is not the mapped admin.
CREATE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT EXISTS (
      SELECT 1
        FROM public.admin_identity
       WHERE id = 1
         AND admin_user_id IS NOT NULL
         AND admin_user_id = auth.uid()
    );
  $$;
COMMENT ON FUNCTION public.is_admin() IS
  'Authorisation predicate for RLS policies: true only when auth.uid() matches the single admin_user_id configured in public.admin_identity. SECURITY DEFINER with an empty search_path; contains no dynamic SQL; fails closed when the mapping is missing/NULL or there is no JWT subject (anon). Never grant EXECUTE to anon — no anon policy calls it.';

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. Draft working set — admin only (no anon grants, no anon policies at all)
-- ----------------------------------------------------------------------------
-- Each table: client role gets the DML privileges it could ever legitimately
-- use, and RLS decides whether this caller is the designated admin. An
-- ordinary authenticated user therefore passes the grant check but matches no
-- policy row: reads return zero rows and writes raise 42501 (WITH CHECK).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.heroes TO authenticated;
CREATE POLICY heroes_admin_all ON public.heroes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY heroes_admin_all ON public.heroes IS
  'Private draft working set: every row operation requires public.is_admin(). Anonymous and ordinary authenticated callers have no policy here, so they see no rows and cannot write.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skins TO authenticated;
CREATE POLICY skins_admin_all ON public.skins
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY skins_admin_all ON public.skins IS
  'Private draft working set: admin-only read/write (see heroes_admin_all). hero_id and media references remain protected by FKs and grants, not by any public policy.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievements TO authenticated;
CREATE POLICY achievements_admin_all ON public.achievements
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY achievements_admin_all ON public.achievements IS
  'Private draft working set: admin-only read/write.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_entries TO authenticated;
CREATE POLICY timeline_entries_admin_all ON public.timeline_entries
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY timeline_entries_admin_all ON public.timeline_entries IS
  'Private draft working set: admin-only read/write.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_stats TO authenticated;
CREATE POLICY account_stats_admin_all ON public.account_stats
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY account_stats_admin_all ON public.account_stats IS
  'Private singleton account configuration. The public stats strip reads the published copy inside the release payload (02-03/04-06), never this row, so there is deliberately no public policy.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appearance_settings TO authenticated;
CREATE POLICY appearance_settings_admin_all ON public.appearance_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY appearance_settings_admin_all ON public.appearance_settings IS
  'Private singleton appearance configuration (includes custom_css): admin-only. Public pages read the published copy from the release snapshot only.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_sections TO authenticated;
CREATE POLICY homepage_sections_admin_all ON public.homepage_sections
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY homepage_sections_admin_all ON public.homepage_sections IS
  'Private homepage ordering/visibility configuration: admin-only. Public layout comes from the published release payload, not from live rows.';


-- ----------------------------------------------------------------------------
-- 4. Shared media registry — published metadata public, everything else admin
-- ----------------------------------------------------------------------------
-- anon receives an explicit, safe COLUMN subset (never created_by/updated_by,
-- never checksum_sha256) plus an RLS policy that only ever exposes rows whose
-- publication_state = 'published'. Draft/private media metadata is invisible.
GRANT SELECT (id, storage_bucket, object_path, kind, mime_type,
              width_px, height_px, alt_text, publication_state, updated_at)
       ON public.media TO anon;
-- authenticated keeps full column visibility (audit columns are not public
-- data; the role is single-admin by construction), rows are filtered by RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media TO authenticated;

CREATE POLICY media_public_read ON public.media
  FOR SELECT TO anon
  USING (publication_state = 'published');
COMMENT ON POLICY media_public_read ON public.media IS
  'Anonymous callers may read only deliberately published media metadata, and only the safe column subset granted above. Draft/private media must never be anonymously discoverable.';

CREATE POLICY media_auth_read ON public.media
  FOR SELECT TO authenticated
  USING (publication_state = 'published' OR public.is_admin());
COMMENT ON POLICY media_auth_read ON public.media IS
  'Ordinary authenticated users see published media only; the designated admin additionally sees draft/private media metadata.';

CREATE POLICY media_admin_insert ON public.media
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
COMMENT ON POLICY media_admin_insert ON public.media IS
  'Only the designated admin may register media metadata (uploads are driven by server-side flows in 02-04/03-xx).';

CREATE POLICY media_admin_update ON public.media
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY media_admin_update ON public.media IS
  'Only the designated admin may modify media metadata, including flipping publication_state.';

CREATE POLICY media_admin_delete ON public.media
  FOR DELETE TO authenticated
  USING (public.is_admin());
COMMENT ON POLICY media_admin_delete ON public.media IS
  'Only the designated admin may delete media metadata; rows referenced by content stay protected by ON DELETE RESTRICT.';


-- ----------------------------------------------------------------------------
-- 5. Release management — active release metadata public-safe, rest admin
-- ----------------------------------------------------------------------------
-- anon gets only the safe column subset: id, name, status, published_at,
-- updated_at. Internal fields (note, scheduled_for, created_by, updated_by,
-- created_at, source_snapshot_id) are never granted to anon. Selecting them as
-- anon fails with "permission denied for table/column", which is the intended
-- fail-closed behaviour; use the public.published_release view for a clean
-- `select *` shape.
GRANT SELECT (id, name, status, published_at, updated_at) ON public.releases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.releases TO authenticated;

CREATE POLICY releases_public_read ON public.releases
  FOR SELECT TO anon
  USING (status = 'published');
COMMENT ON POLICY releases_public_read ON public.releases IS
  'Anonymous visitors may identify the single active release and its safe metadata (name, timestamps) only. Draft/scheduled/archived releases, notes and schedules are not public.';

CREATE POLICY releases_admin_all ON public.releases
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY releases_admin_all ON public.releases IS
  'Release management (create, schedule, publish pointer, archive) is restricted to the designated admin. An ordinary authenticated user matches no policy on this table and therefore sees no rows.';

-- Snapshots are append-only backups: SELECT + INSERT for the admin publish
-- workflow (04-06); UPDATE/DELETE are withheld at grant level in addition to
-- the reject_snapshot_mutation trigger from 01-03 (defence in depth). No anon
-- access of any kind: backup payloads are never public.
GRANT SELECT, INSERT ON public.release_snapshots TO authenticated;
CREATE POLICY release_snapshots_admin_all ON public.release_snapshots
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY release_snapshots_admin_all ON public.release_snapshots IS
  'Immutable release history is admin-only. UPDATE/DELETE are additionally impossible through missing grants and the 01-03 immutability trigger; snapshots contain full pre-publication payloads and must never be publicly readable.';


-- ----------------------------------------------------------------------------
-- 6. Published projection — intentionally public read path, admin-only writes
-- ----------------------------------------------------------------------------
-- This is the ONLY content read path granted to anon. Rows only ever exist
-- here after a publish transaction (04-06), so `USING (true)` is the correct,
-- deliberately public predicate on these projection tables — it is never used
-- on a draft/private table.
GRANT SELECT ON public.published_heroes        TO anon, authenticated;
GRANT SELECT ON public.published_skins         TO anon, authenticated;
GRANT SELECT ON public.published_achievements  TO anon, authenticated;
GRANT SELECT ON public.published_timeline_entries TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.published_heroes        TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.published_skins         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.published_achievements  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.published_timeline_entries TO authenticated;

CREATE POLICY published_heroes_public_read ON public.published_heroes
  FOR SELECT TO anon, authenticated
  USING (true);
COMMENT ON POLICY published_heroes_public_read ON public.published_heroes IS
  'Intentionally public: the published projection exists solely for anonymous reads. Draft heroes never live in this table, so no draft data can be exposed by this policy.';

CREATE POLICY published_heroes_admin_all ON public.published_heroes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY published_heroes_admin_all ON public.published_heroes IS
  'Only the designated admin (through the server-side publish/rollback transaction of 04-06) may write the public projection; direct writes are still constrained by FKs, CHECKs and the single-published-release index.';

CREATE POLICY published_skins_public_read ON public.published_skins
  FOR SELECT TO anon, authenticated
  USING (true);
COMMENT ON POLICY published_skins_public_read ON public.published_skins IS
  'Intentionally public published projection read path (see published_heroes_public_read).';

CREATE POLICY published_skins_admin_all ON public.published_skins
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY published_skins_admin_all ON public.published_skins IS
  'Admin-only writes to the public projection (publish/rollback path of 04-06).';

CREATE POLICY published_achievements_public_read ON public.published_achievements
  FOR SELECT TO anon, authenticated
  USING (true);
COMMENT ON POLICY published_achievements_public_read ON public.published_achievements IS
  'Intentionally public published projection read path (see published_heroes_public_read).';

CREATE POLICY published_achievements_admin_all ON public.published_achievements
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY published_achievements_admin_all ON public.published_achievements IS
  'Admin-only writes to the public projection (publish/rollback path of 04-06).';

CREATE POLICY published_timeline_entries_public_read ON public.published_timeline_entries
  FOR SELECT TO anon, authenticated
  USING (true);
COMMENT ON POLICY published_timeline_entries_public_read ON public.published_timeline_entries IS
  'Intentionally public published projection read path (see published_heroes_public_read).';

CREATE POLICY published_timeline_entries_admin_all ON public.published_timeline_entries
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
COMMENT ON POLICY published_timeline_entries_admin_all ON public.published_timeline_entries IS
  'Admin-only writes to the public projection (publish/rollback path of 04-06).';


-- ----------------------------------------------------------------------------
-- 7. Public views — safe, stable shapes for `select *` consumers (PostgREST)
-- ----------------------------------------------------------------------------
-- security_invoker = true: the view adds no privileges of its own; it runs with
-- the caller's grants and RLS. The views exist so anonymous consumers can use
-- `select *` without hitting the deliberate column-level denials on `media`
-- and `releases`.
CREATE VIEW public.published_media
  WITH (security_invoker = true)
  AS
  SELECT id, storage_bucket, object_path, kind, mime_type,
         width_px, height_px, alt_text, updated_at
    FROM public.media
   WHERE publication_state = 'published';
COMMENT ON VIEW public.published_media IS
  'Read-only public shape of deliberately published media metadata: safe columns only (no created_by, no checksum), enforced by anon column grants plus the media_public_read RLS policy. security_invoker keeps the underlying policy load-bearing.';

CREATE VIEW public.published_release
  WITH (security_invoker = true)
  AS
  SELECT id, name, status, published_at, updated_at
    FROM public.releases
   WHERE status = 'published';
COMMENT ON VIEW public.published_release IS
  'Read-only public shape of the single active release (0 rows when nothing is published). Excludes note, scheduled_for, actor columns and source_snapshot_id by construction of the anon column grants.';

GRANT SELECT ON public.published_media   TO anon, authenticated;
GRANT SELECT ON public.published_release TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 8. Storage security foundations (guarded: service tables may be absent)
-- ----------------------------------------------------------------------------
-- The local sandbox database has the `storage` schema but not the service
-- tables (full service migrations did not complete — recorded in
-- PROJECT_STATE.md). Everything below therefore runs only when the tables
-- exist; bucket creation and per-bucket RLS policies are task 02-04, which
-- must also re-check these grants before enabling uploads.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE '01-04: storage service tables absent — storage foundation skipped; task 02-04 must apply and test bucket/object policies.';
    RETURN;
  END IF;

  -- Defence in depth: RLS on both storage tables even if a future service
  -- migration or restore lost it.
  EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY';

  -- Clients never manage buckets through SQL (the Storage API uses its own
  -- privileged role, and the Data API does not expose the storage schema).
  EXECUTE 'REVOKE ALL ON TABLE storage.buckets FROM anon, authenticated';

  -- Anonymous callers must never create, modify or delete objects; uploads are
  -- admin-driven (authenticated) and go through storage RLS policies (02-04).
  -- anon SELECT on storage.objects is left untouched here because public-bucket
  -- read behaviour cannot be verified in this environment — 02-04 reviews it.
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE storage.objects FROM anon';

  RAISE NOTICE '01-04: storage foundation applied (RLS ensured, buckets table closed to clients, anon writes on objects revoked).';
END $$;

-- Same deny-by-default for storage-schema objects created later by this role.
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE ALL ON TABLES       FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE ALL ON SEQUENCES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Done. Evidence: supabase/tests/01-04_rls_grants_verification.sql
-- ----------------------------------------------------------------------------
