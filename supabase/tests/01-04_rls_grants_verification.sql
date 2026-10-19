-- ============================================================================
-- Task 01-04 — RLS / grants verification for the MLBB Showcase database
--
-- Covers: policy intent and grants reviewed table-by-table, plus behavioural
-- checks for `anon`, an ordinary `authenticated` user, the designated admin
-- (JWT subject == mapped admin_user_id), `service_role`, fail-closed admin
-- mapping, deny-by-default default privileges, and the storage foundation.
--
-- How to run (from the repository root, local Supabase database container up):
--   docker exec -i supabase_db_My-Mlbb psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/01-04_rls_grants_verification.sql
--
-- Everything runs inside ONE transaction and is ROLLED BACK at the end: no
-- fixture, helper, or probe object survives. A failed assertion raises an
-- exception at the end (non-zero psql exit with ON_ERROR_STOP=1); every
-- assertion is also printed as a `PASS:`/`FAIL:` NOTICE.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- Helpers (created here, granted to PUBLIC so they remain callable after
-- SET ROLE; v0104_assert is SECURITY DEFINER so any role can record results;
-- the executors are SECURITY INVOKER so queries run as the simulated role)
-- ----------------------------------------------------------------------------
CREATE TABLE public.test_results_0104 (
  label  text PRIMARY KEY,
  ok     boolean NOT NULL,
  detail text NOT NULL DEFAULT ''
);

CREATE FUNCTION public.v0104_assert(p_label text, p_ok boolean, p_detail text DEFAULT '')
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.test_results_0104 AS r (label, ok, detail)
  VALUES (p_label, p_ok, COALESCE(p_detail, ''))
  ON CONFLICT (label) DO UPDATE SET ok = EXCLUDED.ok, detail = EXCLUDED.detail;
  RAISE NOTICE '[%] % %',
    CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, p_label,
    COALESCE(p_detail, '');
END $$;

CREATE FUNCTION public.v0104_bool(p_label text, p_sql text, p_expected boolean)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  EXECUTE p_sql INTO v;
  PERFORM public.v0104_assert(p_label, v IS NOT DISTINCT FROM p_expected,
                              format('expected %s, got %s', p_expected, v));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.v0104_assert(p_label, false, format('error %s: %s', SQLSTATE, SQLERRM));
END $$;

CREATE FUNCTION public.v0104_count(p_label text, p_sql text, p_expected bigint)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  EXECUTE p_sql INTO v;
  PERFORM public.v0104_assert(p_label, v = p_expected,
                              format('expected %s row(s), got %s', p_expected, v));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.v0104_assert(p_label, false, format('error %s: %s', SQLSTATE, SQLERRM));
END $$;

CREATE FUNCTION public.v0104_rowcount(p_label text, p_sql text, p_expected bigint)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v = ROW_COUNT;
  PERFORM public.v0104_assert(p_label, v = p_expected,
                              format('expected %s affected row(s), got %s', p_expected, v));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.v0104_assert(p_label, false, format('error %s: %s', SQLSTATE, SQLERRM));
END $$;

-- Must fail. p_states is a comma-separated list of acceptable SQLSTATEs
-- (42501 = insufficient_privilege / RLS violation, P0001 = trigger rejection).
CREATE FUNCTION public.v0104_denied(p_label text, p_sql text, p_states text DEFAULT '42501')
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM public.v0104_assert(p_label, false, 'expected denial, but the statement succeeded');
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = ANY (string_to_array(p_states, ',')) THEN
    PERFORM public.v0104_assert(p_label, true, format('denied with %s', SQLSTATE));
  ELSE
    PERFORM public.v0104_assert(p_label, false, format('unexpected %s: %s', SQLSTATE, SQLERRM));
  END IF;
END $$;

CREATE FUNCTION public.v0104_allowed(p_label text, p_sql text)
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM public.v0104_assert(p_label, true, 'allowed');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.v0104_assert(p_label, false, format('unexpected %s: %s', SQLSTATE, SQLERRM));
END $$;

GRANT EXECUTE ON FUNCTION public.v0104_assert(text, boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0104_bool(text, text, boolean)   TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0104_count(text, text, bigint)   TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0104_rowcount(text, text, bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0104_denied(text, text, text)    TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0104_allowed(text, text)         TO PUBLIC;

-- ----------------------------------------------------------------------------
-- Fixtures (rolled back): two auth users, one published + one draft release,
-- published + draft media, one draft hero, one row per published projection
-- table, one immutable snapshot.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111101', 'admin0104@test.local'),
  ('22222222-2222-4222-8222-222222222202', 'stranger0104@test.local');

INSERT INTO public.releases (id, name, status, published_at) VALUES
  ('aaaaaaa1-0000-4000-8000-000000000001', 'Release One',   'published', now()),
  ('aaaaaaa2-0000-4000-8000-000000000002', 'Release Two',   'draft',     NULL);

INSERT INTO public.media (id, storage_bucket, object_path, kind, mime_type, byte_size, publication_state) VALUES
  ('bbbbbbb1-0000-4000-8000-000000000001', 'public-media',  'hero/published-1.png', 'portrait', 'image/png', 1234, 'published'),
  ('bbbbbbb2-0000-4000-8000-000000000002', 'private-media', 'draft/secret-1.png',   'other',    'image/png', 999,  'draft');

INSERT INTO public.heroes (id, name, slug, primary_role, publication_state, portrait_media_id) VALUES
  ('ccccccc1-0000-4000-8000-000000000001', 'Draft Hero', 'draft-hero-0104', 'mage', 'draft',
   'bbbbbbb2-0000-4000-8000-000000000002');

INSERT INTO public.published_heroes (id, release_id, name, slug, primary_role, mastery_level, total_matches) VALUES
  ('ddddddd1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001',
   'Published Hero', 'published-hero-0104', 'mage', 60, 1200);

INSERT INTO public.published_skins (id, release_id, hero_id, name, slug, rarity) VALUES
  ('eeeeeee1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001',
   'ddddddd1-0000-4000-8000-000000000001', 'Published Skin', 'published-skin-0104', 'epic');

INSERT INTO public.published_achievements (id, release_id, title, category) VALUES
  ('fffffff1-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001',
   'Published Achievement', 'rank');

INSERT INTO public.published_timeline_entries (id, release_id, title, kind, occurred_on) VALUES
  ('fffffff2-0000-4000-8000-000000000002', 'aaaaaaa1-0000-4000-8000-000000000001',
   'Published Milestone', 'milestone', DATE '2024-01-15');

INSERT INTO public.release_snapshots (id, release_id, version, label, payload, checksum_sha256) VALUES
  ('99999999-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001',
   1, 'fixture snapshot',
   '{"format": "test"}'::jsonb,
   '0000000000000000000000000000000000000000000000000000000000000001');

-- Probe objects for the ALTER DEFAULT PRIVILEGES evidence (dropped after).
CREATE TABLE public.zzz_probe_0104 (id integer);
CREATE FUNCTION public.zzz_probe_fn_0104() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

-- ----------------------------------------------------------------------------
-- PHASE 0 — structural checks and the grant matrix (as postgres)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v int;
  v_tables constant text := 'media, heroes, skins, achievements, timeline_entries, account_stats, appearance_settings, homepage_sections, releases, release_snapshots, published_heroes, published_skins, published_achievements, published_timeline_entries, admin_identity';
  v_public_tables constant text := 'media, releases, published_heroes, published_skins, published_achievements, published_timeline_entries';
BEGIN
  -- RLS enabled on every table in the public schema (15 incl. admin_identity)
  SELECT count(*) INTO v FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relrowsecurity
     AND c.relname = ANY (string_to_array(v_tables, ', '));
  PERFORM public.v0104_assert('0.1 RLS enabled on all 15 tables', v = 15, format('got %s', v));

  SELECT count(*) INTO v FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity;
  PERFORM public.v0104_assert('0.2 no FORCE ROW LEVEL SECURITY (owner/service publish path stays possible)',
                              v = 0, format('got %s', v));

  -- anon policies exist ONLY on the intentionally public tables, all of them SELECT
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname = 'public' AND roles @> ARRAY['anon']::name[];
  PERFORM public.v0104_assert('0.3 exactly 6 anon policies (published projection x4, media, releases)',
                              v = 6, format('got %s', v));

  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname = 'public' AND roles @> ARRAY['anon']::name[]
     AND cmd = 'SELECT'
     AND tablename = ANY (string_to_array(v_public_tables, ', '));
  PERFORM public.v0104_assert('0.4 every anon policy is SELECT on a public table', v = 6, format('got %s', v));

  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname = 'public' AND roles @> ARRAY['anon']::name[]
     AND tablename IN ('heroes','skins','achievements','timeline_entries','account_stats',
                       'appearance_settings','homepage_sections','release_snapshots','admin_identity');
  PERFORM public.v0104_assert('0.5 zero anon policies on any private table', v = 0, format('got %s', v));

  SELECT count(*) INTO v FROM pg_policies WHERE schemaname = 'public';
  PERFORM public.v0104_assert('0.6 policy inventory = 23', v = 23, format('got %s', v));

  -- Admin-only policies on every draft working table
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('heroes','skins','achievements','timeline_entries','account_stats',
                       'appearance_settings','homepage_sections')
     AND cmd = 'ALL' AND roles @> ARRAY['authenticated']::name[];
  PERFORM public.v0104_assert('0.7 seven admin-only FOR ALL policies on the draft working set',
                              v = 7, format('got %s', v));

  -- Public views are invoker-safe
  SELECT count(*) INTO v FROM pg_class
   WHERE relname IN ('published_media','published_release') AND relkind = 'v'
     AND reloptions @> ARRAY['security_invoker=true'];
  PERFORM public.v0104_assert('0.8 both public views use security_invoker', v = 2, format('got %s', v));

  -- Default privileges: no client-role grants on future public/storage objects
  SELECT count(*) INTO v FROM pg_default_acl d
   JOIN pg_namespace n ON n.oid = d.defaclnamespace
   WHERE n.nspname IN ('public','storage') AND d.defaclrole = 'postgres'::regrole
     AND (d.defaclacl::text LIKE '%anon%' OR d.defaclacl::text LIKE '%authenticated%'
          OR d.defaclacl::text ~ '(^|[,{])=');
  PERFORM public.v0104_assert('0.9 ALTER DEFAULT PRIVILEGES: new objects denied to anon/authenticated/PUBLIC',
                              v = 0, format('got %s offending entries', v));

  -- Fresh objects really are denied (proves 0.9 is effective, not just tidy)
  PERFORM public.v0104_bool('0.10 newly created table grants nothing to anon',
    'SELECT has_table_privilege(''anon'', ''public.zzz_probe_0104'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.11 newly created table grants nothing to authenticated',
    'SELECT has_table_privilege(''authenticated'', ''public.zzz_probe_0104'', ''SELECT'')', false);
  -- KNOWN LIMITATION: PostgreSQL's built-in PUBLIC EXECUTE on functions is
  -- merged with pg_default_acl entries and cannot be revoked through
  -- ALTER DEFAULT PRIVILEGES, so a brand-new function starts PUBLIC-executable
  -- until it is explicitly revoked (rule enforced per function; see 0.13).
  PERFORM public.v0104_bool('0.12 KNOWN LIMITATION: new function starts PUBLIC-executable (revoke per function)',
    'SELECT has_function_privilege(''anon'', ''public.zzz_probe_fn_0104()'', ''EXECUTE'')', true);
  PERFORM public.v0104_bool('0.13 is_admin() carries no PUBLIC EXECUTE grant (explicitly revoked)',
    'SELECT count(*) > 0
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       , LATERAL aclexplode(COALESCE(p.proacl, acldefault(''f'', p.proowner))) e
      WHERE n.nspname = ''public'' AND p.proname = ''is_admin'' AND e.grantee = 0', false);
  -- NOTE: RLS is NOT auto-enabled on new tables; recording that explicitly.
  SELECT count(*) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'zzz_probe_0104' AND c.relrowsecurity;
  PERFORM public.v0104_assert('0.14 KNOWN GAP: new table is denied by grants but has RLS off (01-06 checklist)',
                              v = 0, format('relrowsecurity=%s', v));

  -- Schema privileges
  PERFORM public.v0104_bool('0.15 anon cannot CREATE in schema public',
    'SELECT has_schema_privilege(''anon'', ''public'', ''CREATE'')', false);
  PERFORM public.v0104_bool('0.16 authenticated cannot CREATE in schema public',
    'SELECT has_schema_privilege(''authenticated'', ''public'', ''CREATE'')', false);

  -- Grant matrix: anon
  PERFORM public.v0104_bool('0.17 anon may SELECT published_heroes',
    'SELECT has_table_privilege(''anon'', ''public.published_heroes'', ''SELECT'')', true);
  PERFORM public.v0104_bool('0.18 anon may SELECT published_skins',
    'SELECT has_table_privilege(''anon'', ''public.published_skins'', ''SELECT'')', true);
  PERFORM public.v0104_bool('0.19 anon may SELECT published_achievements',
    'SELECT has_table_privilege(''anon'', ''public.published_achievements'', ''SELECT'')', true);
  PERFORM public.v0104_bool('0.20 anon may SELECT published_timeline_entries',
    'SELECT has_table_privilege(''anon'', ''public.published_timeline_entries'', ''SELECT'')', true);
  PERFORM public.v0104_bool('0.21 anon may INSERT nothing (published_heroes INSERT denied)',
    'SELECT has_table_privilege(''anon'', ''public.published_heroes'', ''INSERT'')', false);
  PERFORM public.v0104_bool('0.22 anon has no table privilege on heroes',
    'SELECT has_table_privilege(''anon'', ''public.heroes'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.23 anon has no table privilege on releases',
    'SELECT has_table_privilege(''anon'', ''public.releases'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.24 anon has no table privilege on release_snapshots',
    'SELECT has_table_privilege(''anon'', ''public.release_snapshots'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.25 anon has no table privilege on admin_identity',
    'SELECT has_table_privilege(''anon'', ''public.admin_identity'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.26 anon has no table privilege on appearance_settings',
    'SELECT has_table_privilege(''anon'', ''public.appearance_settings'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.27 anon may read safe media columns only (id yes)',
    'SELECT has_column_privilege(''anon'', ''public.media'', ''id'', ''SELECT'')', true);
  PERFORM public.v0104_bool('0.28 anon may not read media.created_by',
    'SELECT has_column_privilege(''anon'', ''public.media'', ''created_by'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.29 anon may not read media.checksum_sha256',
    'SELECT has_column_privilege(''anon'', ''public.media'', ''checksum_sha256'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.30 anon may read safe release columns only (name yes)',
    'SELECT has_column_privilege(''anon'', ''public.releases'', ''name'', ''SELECT'')', true);
  PERFORM public.v0104_bool('0.31 anon may not read releases.note',
    'SELECT has_column_privilege(''anon'', ''public.releases'', ''note'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.32 anon may not read releases.scheduled_for',
    'SELECT has_column_privilege(''anon'', ''public.releases'', ''scheduled_for'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.33 anon may not read releases.source_snapshot_id',
    'SELECT has_column_privilege(''anon'', ''public.releases'', ''source_snapshot_id'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.34 anon may not read releases.created_by',
    'SELECT has_column_privilege(''anon'', ''public.releases'', ''created_by'', ''SELECT'')', false);
  PERFORM public.v0104_bool('0.35 anon may SELECT both public views',
    'SELECT has_table_privilege(''anon'', ''public.published_media'', ''SELECT'')
        AND has_table_privilege(''anon'', ''public.published_release'', ''SELECT'')', true);

  -- Grant matrix: authenticated
  PERFORM public.v0104_bool('0.36 authenticated may DML draft heroes (RLS still decides rows)',
    'SELECT has_table_privilege(''authenticated'', ''public.heroes'', ''SELECT'')
        AND has_table_privilege(''authenticated'', ''public.heroes'', ''INSERT'')
        AND has_table_privilege(''authenticated'', ''public.heroes'', ''UPDATE'')
        AND has_table_privilege(''authenticated'', ''public.heroes'', ''DELETE'')', true);
  PERFORM public.v0104_bool('0.37 authenticated may INSERT snapshots but never UPDATE them',
    'SELECT has_table_privilege(''authenticated'', ''public.release_snapshots'', ''INSERT'')
        AND has_table_privilege(''authenticated'', ''public.release_snapshots'', ''SELECT'')
        AND NOT has_table_privilege(''authenticated'', ''public.release_snapshots'', ''UPDATE'')', true);
  PERFORM public.v0104_bool('0.38 authenticated may never DELETE snapshots',
    'SELECT has_table_privilege(''authenticated'', ''public.release_snapshots'', ''DELETE'')', false);
  PERFORM public.v0104_bool('0.39 authenticated has NO privilege on admin_identity',
    'SELECT has_table_privilege(''authenticated'', ''public.admin_identity'', ''SELECT'')
        AND has_table_privilege(''authenticated'', ''public.admin_identity'', ''UPDATE'')', false);
  PERFORM public.v0104_bool('0.40 authenticated may write published projection (admin-only via RLS)',
    'SELECT has_table_privilege(''authenticated'', ''public.published_heroes'', ''INSERT'')
        AND has_table_privilege(''authenticated'', ''public.published_heroes'', ''UPDATE'')
        AND has_table_privilege(''authenticated'', ''public.published_heroes'', ''DELETE'')', true);

  -- is_admin() execute grants: fail closed for anon
  PERFORM public.v0104_bool('0.41 anon cannot execute public.is_admin()',
    'SELECT has_function_privilege(''anon'', ''public.is_admin()'', ''EXECUTE'')', false);
  PERFORM public.v0104_bool('0.42 authenticated can execute public.is_admin()',
    'SELECT has_function_privilege(''authenticated'', ''public.is_admin()'', ''EXECUTE'')', true);
  PERFORM public.v0104_bool('0.43 service_role can execute public.is_admin()',
    'SELECT has_function_privilege(''service_role'', ''public.is_admin()'', ''EXECUTE'')', true);
  PERFORM public.v0104_bool('0.44 anon cannot execute the 01-03 trigger helpers',
    'SELECT has_function_privilege(''anon'', ''public.set_updated_at()'', ''EXECUTE'')
        AND has_function_privilege(''anon'', ''public.reject_snapshot_mutation()'', ''EXECUTE'')', false);

  -- Admin mapping starts fail-closed: singleton row, NULL mapping
  PERFORM public.v0104_count('0.45 admin_identity contains exactly one singleton row',
    'SELECT count(*) FROM public.admin_identity', 1);
  PERFORM public.v0104_bool('0.46 admin_user_id is NULL (unconfigured => nobody is admin)',
    'SELECT admin_user_id IS NULL FROM public.admin_identity WHERE id = 1', true);

  -- Storage foundation: guarded, so record which branch ran
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE '[INFO] storage service tables absent in this database: storage foundation deferred to task 02-04';
    PERFORM public.v0104_assert('0.47 storage schema present (tables absent => guarded branch taken)',
      to_regnamespace('storage') IS NOT NULL, 'storage schema exists, tables missing');
  ELSE
    PERFORM public.v0104_bool('0.47 storage.objects has RLS enabled',
      'SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(''storage.objects'')', true);
  END IF;
END $$;

DROP TABLE public.zzz_probe_0104;
DROP FUNCTION public.zzz_probe_fn_0104();

-- ----------------------------------------------------------------------------
-- PHASE A — anonymous visitor: published content only, never drafts
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('role', 'anon', true);

  PERFORM public.v0104_count('A.01 anon reads published_heroes',        'SELECT count(*) FROM public.published_heroes', 1);
  PERFORM public.v0104_count('A.02 anon reads published_skins',         'SELECT count(*) FROM public.published_skins', 1);
  PERFORM public.v0104_count('A.03 anon reads published_achievements',  'SELECT count(*) FROM public.published_achievements', 1);
  PERFORM public.v0104_count('A.04 anon reads published_timeline',      'SELECT count(*) FROM public.published_timeline_entries', 1);
  PERFORM public.v0104_count('A.05 anon sees only published media rows',
    'SELECT count(*) FROM public.media WHERE publication_state = ''published''', 1);
  PERFORM public.v0104_count('A.06 anon sees zero draft media rows',
    'SELECT count(*) FROM public.media WHERE publication_state = ''draft''', 0);
  PERFORM public.v0104_count('A.07 anon sees only the active release',
    'SELECT count(*) FROM public.releases WHERE status = ''published''', 1);
  PERFORM public.v0104_count('A.08 anon sees zero draft releases',
    'SELECT count(*) FROM public.releases WHERE status = ''draft''', 0);
  PERFORM public.v0104_count('A.09 anon public view published_media returns published rows',
    'SELECT count(*) FROM public.published_media', 1);
  PERFORM public.v0104_count('A.10 anon public view published_release returns the active release',
    'SELECT count(*) FROM public.published_release', 1);

  PERFORM public.v0104_denied('A.11 anon cannot read draft heroes',     'SELECT count(*) FROM public.heroes WHERE name <> ''''');
  PERFORM public.v0104_denied('A.12 anon cannot read draft skins',      'SELECT count(*) FROM public.skins WHERE name <> ''''');
  PERFORM public.v0104_denied('A.13 anon cannot read achievements',     'SELECT count(*) FROM public.achievements WHERE title <> ''''');
  PERFORM public.v0104_denied('A.14 anon cannot read timeline entries', 'SELECT count(*) FROM public.timeline_entries WHERE title <> ''''');
  PERFORM public.v0104_denied('A.15 anon cannot read account_stats',    'SELECT count(*) FROM public.account_stats WHERE id = 1');
  PERFORM public.v0104_denied('A.16 anon cannot read appearance_settings',
    'SELECT count(*) FROM public.appearance_settings WHERE id = 1');
  PERFORM public.v0104_denied('A.17 anon cannot read homepage_sections',
    'SELECT count(*) FROM public.homepage_sections WHERE section_id <> ''''');
  PERFORM public.v0104_denied('A.18 anon cannot read release_snapshots',
    'SELECT count(*) FROM public.release_snapshots WHERE version >= 1');
  PERFORM public.v0104_denied('A.19 anon cannot read admin_identity',   'SELECT id FROM public.admin_identity');
  PERFORM public.v0104_denied('A.20 anon cannot read releases.note',    'SELECT note FROM public.releases LIMIT 1');
  PERFORM public.v0104_denied('A.21 anon cannot read releases.scheduled_for',
    'SELECT scheduled_for FROM public.releases LIMIT 1');
  PERFORM public.v0104_denied('A.22 anon cannot read releases.created_by',
    'SELECT created_by FROM public.releases LIMIT 1');
  PERFORM public.v0104_denied('A.23 anon cannot read media.created_by', 'SELECT created_by FROM public.media LIMIT 1');
  PERFORM public.v0104_denied('A.24 anon cannot read media.checksum_sha256',
    'SELECT checksum_sha256 FROM public.media LIMIT 1');
  PERFORM public.v0104_denied('A.25 anon cannot execute public.is_admin()', 'SELECT public.is_admin()');

  PERFORM public.v0104_denied('A.26 anon cannot INSERT draft heroes',
    'INSERT INTO public.heroes (name, slug, primary_role) VALUES (''Anon'', ''anon-hero-0104'', ''mage'')');
  PERFORM public.v0104_denied('A.27 anon cannot INSERT published projection',
    'INSERT INTO public.published_heroes (id, release_id, name, slug, primary_role, mastery_level, total_matches)
     VALUES (''ddddddd9-0000-4000-8000-000000000009'', ''aaaaaaa1-0000-4000-8000-000000000001'',
             ''X'', ''anon-x-0104'', ''mage'', 1, 1)');
  PERFORM public.v0104_denied('A.28 anon cannot UPDATE media',
    'UPDATE public.media SET alt_text = ''tampered'' WHERE publication_state = ''published''');
  PERFORM public.v0104_denied('A.29 anon cannot UPDATE releases',
    'UPDATE public.releases SET name = ''tampered'' WHERE status = ''published''');
  PERFORM public.v0104_denied('A.30 anon cannot DELETE published projection',
    'DELETE FROM public.published_heroes');
  PERFORM public.v0104_denied('A.31 anon cannot INSERT snapshots',
    'INSERT INTO public.release_snapshots (release_id, version, payload, checksum_sha256)
     VALUES (''aaaaaaa1-0000-4000-8000-000000000001'', 99, ''{}''::jsonb,
             ''0000000000000000000000000000000000000000000000000000000000000002'')');

  EXECUTE 'RESET ROLE';
END $$;

-- ----------------------------------------------------------------------------
-- PHASE B — authenticated, mapping still unconfigured (fail closed)
-- JWT subject is already the *intended* admin uid, but admin_user_id is NULL,
-- so nothing may be administered yet.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.v0104_bool('B.01 unconfigured mapping => is_admin() false',
    'SELECT public.is_admin()', false);
  PERFORM public.v0104_count('B.02 authenticated sees no draft heroes',
    'SELECT count(*) FROM public.heroes WHERE name <> ''''', 0);
  PERFORM public.v0104_count('B.03 authenticated sees no releases while unconfigured',
    'SELECT count(*) FROM public.releases WHERE name <> ''''', 0);
  PERFORM public.v0104_count('B.04 authenticated still reads published projection',
    'SELECT count(*) FROM public.published_heroes', 1);
  PERFORM public.v0104_count('B.05 authenticated reads published media only',
    'SELECT count(*) FROM public.media WHERE publication_state = ''published''', 1);

  PERFORM public.v0104_denied('B.06 cannot INSERT hero while unconfigured',
    'INSERT INTO public.heroes (name, slug, primary_role) VALUES (''Too Early'', ''too-early-0104'', ''mage'')');
  PERFORM public.v0104_denied('B.07 cannot INSERT release while unconfigured',
    'INSERT INTO public.releases (name, status) VALUES (''Too Early'', ''draft'')');
  PERFORM public.v0104_denied('B.08 cannot INSERT into published projection while unconfigured',
    'INSERT INTO public.published_heroes (id, release_id, name, slug, primary_role, mastery_level, total_matches)
     VALUES (''ddddddd8-0000-4000-8000-000000000008'', ''aaaaaaa1-0000-4000-8000-000000000001'',
             ''Y'', ''too-early-y-0104'', ''mage'', 1, 1)');
  PERFORM public.v0104_denied('B.09 cannot INSERT snapshot while unconfigured',
    'INSERT INTO public.release_snapshots (release_id, version, payload, checksum_sha256)
     VALUES (''aaaaaaa1-0000-4000-8000-000000000001'', 98, ''{}''::jsonb,
             ''0000000000000000000000000000000000000000000000000000000000000003'')');
  PERFORM public.v0104_rowcount('B.10 UPDATE draft hero matches zero rows',
    'UPDATE public.heroes SET mastery_level = 99 WHERE name = ''Draft Hero''', 0);
  PERFORM public.v0104_rowcount('B.11 UPDATE published media matches zero rows',
    'UPDATE public.media SET alt_text = ''x'' WHERE publication_state = ''published''', 0);
  PERFORM public.v0104_denied('B.12 cannot read admin_identity', 'SELECT id FROM public.admin_identity');
  PERFORM public.v0104_denied('B.13 cannot rewrite its own admin mapping (self-grant blocked)',
    'UPDATE public.admin_identity SET admin_user_id = ''22222222-2222-4222-8222-222222222202''');

  EXECUTE 'RESET ROLE';
END $$;

-- ----------------------------------------------------------------------------
-- PHASE C — operator configures the mapping (server-side only, as postgres)
-- ----------------------------------------------------------------------------
UPDATE public.admin_identity
   SET admin_user_id = '11111111-1111-4111-8111-111111111101'
 WHERE id = 1;

DO $$
BEGIN
  PERFORM public.v0104_bool('C.01 mapping stored',
    'SELECT admin_user_id = ''11111111-1111-4111-8111-111111111101''::uuid FROM public.admin_identity WHERE id = 1', true);
END $$;

-- ----------------------------------------------------------------------------
-- PHASE D — the designated admin (JWT sub == mapped admin_user_id)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.v0104_bool('D.01 is_admin() true for the mapped admin', 'SELECT public.is_admin()', true);
  PERFORM public.v0104_count('D.02 admin sees all draft heroes', 'SELECT count(*) FROM public.heroes WHERE name <> ''''', 1);
  PERFORM public.v0104_count('D.03 admin sees all releases', 'SELECT count(*) FROM public.releases WHERE name <> ''''', 2);
  PERFORM public.v0104_count('D.04 admin sees draft media metadata',
    'SELECT count(*) FROM public.media WHERE publication_state = ''draft''', 1);
  PERFORM public.v0104_count('D.05 admin sees snapshots', 'SELECT count(*) FROM public.release_snapshots WHERE version >= 1', 1);

  PERFORM public.v0104_allowed('D.06 admin INSERTs a draft hero',
    'INSERT INTO public.heroes (name, slug, primary_role) VALUES (''Admin Added'', ''admin-added-0104'', ''fighter'')');
  PERFORM public.v0104_count('D.07 draft hero count grew to 2', 'SELECT count(*) FROM public.heroes WHERE name <> ''''', 2);
  PERFORM public.v0104_rowcount('D.08 admin UPDATEs a draft hero',
    'UPDATE public.heroes SET mastery_level = 70 WHERE slug = ''admin-added-0104''', 1);
  PERFORM public.v0104_allowed('D.09 admin DELETEs its own draft hero',
    'DELETE FROM public.heroes WHERE slug = ''admin-added-0104''');
  PERFORM public.v0104_count('D.10 draft hero count back to 1', 'SELECT count(*) FROM public.heroes WHERE name <> ''''', 1);

  PERFORM public.v0104_allowed('D.11 admin INSERTs a draft skin',
    'INSERT INTO public.skins (name, slug, rarity) VALUES (''Admin Skin'', ''admin-skin-0104'', ''basic'')');
  PERFORM public.v0104_allowed('D.12 admin DELETEs that draft skin',
    'DELETE FROM public.skins WHERE slug = ''admin-skin-0104''');

  PERFORM public.v0104_allowed('D.13 admin INSERTs an achievement',
    'INSERT INTO public.achievements (title, category) VALUES (''Admin Achievement'', ''event'')');
  PERFORM public.v0104_allowed('D.14 admin DELETEs that achievement',
    'DELETE FROM public.achievements WHERE title = ''Admin Achievement''');

  PERFORM public.v0104_allowed('D.15 admin INSERTs a timeline entry',
    'INSERT INTO public.timeline_entries (title, occurred_on) VALUES (''Admin Milestone'', DATE ''2025-06-01'')');
  PERFORM public.v0104_allowed('D.16 admin DELETEs that timeline entry',
    'DELETE FROM public.timeline_entries WHERE title = ''Admin Milestone''');

  PERFORM public.v0104_rowcount('D.17 admin UPDATEs account_stats',
    'UPDATE public.account_stats SET total_matches = total_matches WHERE id = 1', 1);
  PERFORM public.v0104_rowcount('D.18 admin UPDATEs appearance_settings',
    'UPDATE public.appearance_settings SET typography_scale = 1.00 WHERE id = 1', 1);
  PERFORM public.v0104_rowcount('D.19 admin UPDATEs homepage_sections',
    'UPDATE public.homepage_sections SET is_enabled = is_enabled WHERE section_id = ''spotlight''', 1);

  PERFORM public.v0104_allowed('D.20 admin INSERTs a draft release',
    'INSERT INTO public.releases (name, status) VALUES (''Release Three'', ''draft'')');
  PERFORM public.v0104_count('D.21 release count grew to 3', 'SELECT count(*) FROM public.releases WHERE name <> ''''', 3);
  PERFORM public.v0104_allowed('D.22 admin DELETEs that draft release',
    'DELETE FROM public.releases WHERE name = ''Release Three''');
  PERFORM public.v0104_count('D.23 release count back to 2', 'SELECT count(*) FROM public.releases WHERE name <> ''''', 2);

  PERFORM public.v0104_rowcount('D.24 admin UPDATEs media metadata',
    'UPDATE public.media SET alt_text = ''admin updated'' WHERE object_path = ''draft/secret-1.png''', 1);

  PERFORM public.v0104_allowed('D.25 admin (publish path) INSERTs into published projection',
    'INSERT INTO public.published_heroes (id, release_id, name, slug, primary_role, mastery_level, total_matches)
     VALUES (''ddddddd7-0000-4000-8000-000000000007'', ''aaaaaaa1-0000-4000-8000-000000000001'',
             ''Admin Published'', ''admin-published-0104'', ''tank'', 5, 10)');
  PERFORM public.v0104_count('D.26 published projection grew to 2', 'SELECT count(*) FROM public.published_heroes', 2);
  PERFORM public.v0104_allowed('D.27 admin DELETEs that published row (rollback path)',
    'DELETE FROM public.published_heroes WHERE slug = ''admin-published-0104''');
  PERFORM public.v0104_count('D.28 published projection back to 1', 'SELECT count(*) FROM public.published_heroes', 1);

  PERFORM public.v0104_allowed('D.29 admin (publish path) INSERTs a snapshot',
    'INSERT INTO public.release_snapshots (release_id, version, payload, checksum_sha256)
     VALUES (''aaaaaaa1-0000-4000-8000-000000000001'', 2, ''{}''::jsonb,
             ''0000000000000000000000000000000000000000000000000000000000000004'')');
  PERFORM public.v0104_denied('D.30 admin can never UPDATE a snapshot',
    'UPDATE public.release_snapshots SET label = ''rewritten'' WHERE version = 1');
  PERFORM public.v0104_denied('D.31 admin can never DELETE a snapshot',
    'DELETE FROM public.release_snapshots WHERE version = 1', '42501,P0001');

  PERFORM public.v0104_denied('D.32 admin still cannot read admin_identity (server-side only)',
    'SELECT admin_user_id FROM public.admin_identity');
  PERFORM public.v0104_denied('D.33 admin still cannot rewrite admin_identity',
    'UPDATE public.admin_identity SET admin_user_id = ''22222222-2222-4222-8222-222222222202''');

  EXECUTE 'RESET ROLE';
END $$;

-- ----------------------------------------------------------------------------
-- PHASE E — ordinary authenticated user while a mapping exists
-- (different JWT subject; single-admin auth in 02-01 means this role should
-- never exist in production, but the database must not rely on that)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222202', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.v0104_bool('E.01 is_admin() false for a different authenticated user', 'SELECT public.is_admin()', false);
  PERFORM public.v0104_count('E.02 sees zero draft heroes', 'SELECT count(*) FROM public.heroes WHERE name <> ''''', 0);
  PERFORM public.v0104_count('E.03 sees zero releases', 'SELECT count(*) FROM public.releases WHERE name <> ''''', 0);
  PERFORM public.v0104_count('E.04 sees zero snapshots', 'SELECT count(*) FROM public.release_snapshots WHERE version >= 1', 0);
  PERFORM public.v0104_count('E.05 sees zero draft media rows',
    'SELECT count(*) FROM public.media WHERE publication_state = ''draft''', 0);
  PERFORM public.v0104_count('E.06 reads published heroes', 'SELECT count(*) FROM public.published_heroes', 1);
  PERFORM public.v0104_count('E.07 reads published media', 'SELECT count(*) FROM public.media WHERE publication_state = ''published''', 1);

  PERFORM public.v0104_denied('E.08 cannot INSERT a draft hero',
    'INSERT INTO public.heroes (name, slug, primary_role) VALUES (''Impostor'', ''impostor-0104'', ''mage'')');
  PERFORM public.v0104_denied('E.09 cannot INSERT a release',
    'INSERT INTO public.releases (name, status) VALUES (''Impostor Release'', ''draft'')');
  PERFORM public.v0104_denied('E.10 cannot INSERT into published projection',
    'INSERT INTO public.published_heroes (id, release_id, name, slug, primary_role, mastery_level, total_matches)
     VALUES (''ddddddd6-0000-4000-8000-000000000006'', ''aaaaaaa1-0000-4000-8000-000000000001'',
             ''Z'', ''impostor-z-0104'', ''mage'', 1, 1)');
  PERFORM public.v0104_denied('E.11 cannot INSERT a snapshot',
    'INSERT INTO public.release_snapshots (release_id, version, payload, checksum_sha256)
     VALUES (''aaaaaaa1-0000-4000-8000-000000000001'', 97, ''{}''::jsonb,
             ''0000000000000000000000000000000000000000000000000000000000000005'')');
  PERFORM public.v0104_rowcount('E.12 UPDATE draft hero matches zero rows',
    'UPDATE public.heroes SET mastery_level = 1 WHERE name = ''Draft Hero''', 0);
  PERFORM public.v0104_rowcount('E.13 UPDATE published media matches zero rows',
    'UPDATE public.media SET alt_text = ''x'' WHERE publication_state = ''published''', 0);
  PERFORM public.v0104_denied('E.14 cannot read admin_identity', 'SELECT id FROM public.admin_identity');
  PERFORM public.v0104_denied('E.15 cannot rewrite admin_identity',
    'UPDATE public.admin_identity SET admin_user_id = ''22222222-2222-4222-8222-222222222202''');

  EXECUTE 'RESET ROLE';
END $$;

-- ----------------------------------------------------------------------------
-- PHASE F — service_role (server-side only) and final summary
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('role', 'service_role', true);

  PERFORM public.v0104_count('F.01 service_role reads admin_identity (server-side configuration path)',
    'SELECT count(*) FROM public.admin_identity', 1);
  PERFORM public.v0104_count('F.02 service_role reads draft rows (publish transaction path)',
    'SELECT count(*) FROM public.heroes WHERE name <> ''''', 1);
  PERFORM public.v0104_count('F.03 service_role reads snapshots (rollback path; 1 fixture + D.29)',
    'SELECT count(*) FROM public.release_snapshots WHERE version >= 1', 2);

  EXECUTE 'RESET ROLE';
END $$;

DO $$
DECLARE v_failed int; v_total int;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO v_failed, v_total
    FROM public.test_results_0104;
  IF v_failed > 0 THEN
    RAISE EXCEPTION '01-04 verification FAILED: % of % assertion(s) failed', v_failed, v_total
      USING HINT = 'Search the log above for [FAIL] lines.';
  END IF;
  RAISE NOTICE '=== 01-04 verification PASSED: % assertions ===', v_total;
END $$;

ROLLBACK;
