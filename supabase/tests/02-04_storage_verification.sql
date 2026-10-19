-- ============================================================================
-- Task 02-04 — Supabase Storage buckets & policies verification
--
-- Covers: bucket configuration (public vs private, size limit, allowed MIME
-- types), RLS on storage.objects/buckets, and behavioural checks for anon, an
-- ordinary authenticated user, the configured admin, and service_role —
-- including the invariant that a public-bucket write only succeeds when a
-- published media row names the exact bucket+path.
--
-- How to run (from the repository root, against a database that has the
-- Supabase Storage service tables — a hosted project or a fully initialised
-- local stack):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f - \
--     < supabase/tests/02-04_storage_verification.sql
--   (locally, when the container exists:)
--   docker exec -i supabase_db_My-Mlbb psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/02-04_storage_verification.sql
--
-- Everything runs inside ONE transaction and is ROLLED BACK: no fixture,
-- object row, or helper survives. A failed assertion raises at the end (non-zero
-- psql exit with ON_ERROR_STOP=1); each assertion also prints a PASS/FAIL
-- NOTICE. If storage.buckets/storage.objects are absent (the current sandbox),
-- the whole file is skipped with an explicit message instead of erroring.
-- ============================================================================

\set ON_ERROR_STOP on

SELECT to_regclass('storage.buckets') IS NOT NULL
   AND to_regclass('storage.objects') IS NOT NULL AS has_storage \gset

\if :has_storage

BEGIN;

-- ----------------------------------------------------------------------------
-- Helpers (created here; v0204_assert is SECURITY DEFINER so any role records
-- results; the executors are SECURITY INVOKER so statements run as the role)
-- ----------------------------------------------------------------------------
CREATE TABLE public.test_results_0204 (
  label  text PRIMARY KEY,
  ok     boolean NOT NULL,
  detail text NOT NULL DEFAULT ''
);

CREATE FUNCTION public.v0204_assert(p_label text, p_ok boolean, p_detail text DEFAULT '')
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.test_results_0204 AS r (label, ok, detail)
  VALUES (p_label, p_ok, COALESCE(p_detail, ''))
  ON CONFLICT (label) DO UPDATE SET ok = EXCLUDED.ok, detail = EXCLUDED.detail;
  RAISE NOTICE '[%] % %',
    CASE WHEN p_ok THEN 'PASS' ELSE 'FAIL' END, p_label, COALESCE(p_detail, '');
END $$;

CREATE FUNCTION public.v0204_bool(p_label text, p_sql text, p_expected boolean)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  EXECUTE p_sql INTO v;
  PERFORM public.v0204_assert(p_label, v IS NOT DISTINCT FROM p_expected,
                              format('expected %s, got %s', p_expected, v));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.v0204_assert(p_label, false, format('error %s: %s', SQLSTATE, SQLERRM));
END $$;

CREATE FUNCTION public.v0204_count(p_label text, p_sql text, p_expected bigint)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  EXECUTE p_sql INTO v;
  PERFORM public.v0204_assert(p_label, v = p_expected,
                              format('expected %s row(s), got %s', p_expected, v));
EXCEPTION WHEN OTHERS THEN
  PERFORM public.v0204_assert(p_label, false, format('error %s: %s', SQLSTATE, SQLERRM));
END $$;

-- Must fail. 42501 = insufficient_privilege / RLS violation.
CREATE FUNCTION public.v0204_denied(p_label text, p_sql text, p_states text DEFAULT '42501')
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM public.v0204_assert(p_label, false, 'expected denial, but the statement succeeded');
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = ANY (string_to_array(p_states, ',')) THEN
    PERFORM public.v0204_assert(p_label, true, format('denied with %s', SQLSTATE));
  ELSE
    PERFORM public.v0204_assert(p_label, false, format('unexpected %s: %s', SQLSTATE, SQLERRM));
  END IF;
END $$;

CREATE FUNCTION public.v0204_allowed(p_label text, p_sql text)
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM public.v0204_assert(p_label, true, 'allowed');
EXCEPTION WHEN OTHERS THEN
  PERFORM public.v0204_assert(p_label, false, format('unexpected %s: %s', SQLSTATE, SQLERRM));
END $$;

GRANT EXECUTE ON FUNCTION public.v0204_assert(text, boolean, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0204_bool(text, text, boolean)   TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0204_count(text, text, bigint)   TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0204_denied(text, text, text)    TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.v0204_allowed(text, text)         TO PUBLIC;

-- ----------------------------------------------------------------------------
-- Fixtures (rolled back): auth users, a published media row in the public
-- bucket, one draft object row and one published object row in storage.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111101', 'admin0204@test.local'),
  ('22222222-2222-4222-8222-222222222202', 'stranger0204@test.local');

INSERT INTO public.media
  (id, storage_bucket, object_path, kind, mime_type, byte_size, publication_state)
VALUES
  ('bbbbbbb1-0000-4000-8000-0000000000a1', 'showcase-public',
   'portrait/aaaaaaaa-0000-4000-8000-0000000000a1.png', 'portrait', 'image/png', 1234, 'published'),
  ('bbbbbbb2-0000-4000-8000-0000000000a2', 'showcase-draft',
   'portrait/aaaaaaaa-0000-4000-8000-0000000000a2.png', 'portrait', 'image/png', 1234, 'draft'),
  ('bbbbbbb3-0000-4000-8000-0000000000b3', 'showcase-public',
   'portrait/aaaaaaaa-0000-4000-8000-0000000000b1.png', 'portrait', 'image/png', 1234, 'published');

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('showcase-public', 'portrait/aaaaaaaa-0000-4000-8000-0000000000a1.png'),
  ('showcase-draft',  'portrait/aaaaaaaa-0000-4000-8000-0000000000a2.png');

-- ----------------------------------------------------------------------------
-- PHASE 0 — structural: buckets, RLS, policies, grants (as owner)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v int;
BEGIN
  -- Buckets exist with the intended public/private split.
  PERFORM public.v0204_bool('0.1 public bucket exists and is public',
    'SELECT public FROM storage.buckets WHERE id = ''showcase-public''', true);
  PERFORM public.v0204_bool('0.2 draft bucket exists and is NOT public',
    'SELECT public FROM storage.buckets WHERE id = ''showcase-draft''', false);

  -- Per-bucket size limit and MIME allowlist match the upload policy.
  PERFORM public.v0204_bool('0.3 both buckets cap uploads at 10 MiB',
    'SELECT bool_and(file_size_limit = 10485760) FROM storage.buckets
      WHERE id IN (''showcase-public'', ''showcase-draft'')', true);
  PERFORM public.v0204_bool('0.4 both buckets allow exactly png/jpeg/webp/avif',
    'SELECT bool_and(
        (SELECT array_agg(m ORDER BY m) FROM unnest(allowed_mime_types) m)
        = ARRAY[''image/avif'',''image/jpeg'',''image/png'',''image/webp''])
      FROM storage.buckets WHERE id IN (''showcase-public'', ''showcase-draft'')', true);

  -- RLS is on.
  PERFORM public.v0204_bool('0.5 storage.objects has RLS enabled',
    'SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(''storage.objects'')', true);
  PERFORM public.v0204_bool('0.6 storage.buckets has RLS enabled',
    'SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(''storage.buckets'')', true);

  -- Policy inventory: 8 policies, all on storage.objects, none granting anon a write.
  SELECT count(*) INTO v FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';
  PERFORM public.v0204_assert('0.7 eight storage.objects policies', v = 8, format('got %s', v));

  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND roles @> ARRAY['anon']::name[] AND cmd <> 'SELECT';
  PERFORM public.v0204_assert('0.8 no anon write policy on storage.objects', v = 0, format('got %s', v));

  PERFORM public.v0204_bool('0.9 anon has no INSERT privilege on storage.objects',
    'SELECT has_table_privilege(''anon'', ''storage.objects'', ''INSERT'')', false);
  PERFORM public.v0204_bool('0.10 anon has no UPDATE privilege on storage.objects',
    'SELECT has_table_privilege(''anon'', ''storage.objects'', ''UPDATE'')', false);
  PERFORM public.v0204_bool('0.11 anon has no DELETE privilege on storage.objects',
    'SELECT has_table_privilege(''anon'', ''storage.objects'', ''DELETE'')', false);

  -- Clients never manage buckets.
  PERFORM public.v0204_bool('0.12 anon has no privilege on storage.buckets',
    'SELECT has_table_privilege(''anon'', ''storage.buckets'', ''SELECT'')
         OR has_table_privilege(''anon'', ''storage.buckets'', ''INSERT'')
         OR has_table_privilege(''anon'', ''storage.buckets'', ''UPDATE'')
         OR has_table_privilege(''anon'', ''storage.buckets'', ''DELETE'')', false);
  PERFORM public.v0204_bool('0.13 authenticated has no privilege on storage.buckets',
    'SELECT has_table_privilege(''authenticated'', ''storage.buckets'', ''SELECT'')
         OR has_table_privilege(''authenticated'', ''storage.buckets'', ''INSERT'')
         OR has_table_privilege(''authenticated'', ''storage.buckets'', ''UPDATE'')
         OR has_table_privilege(''authenticated'', ''storage.buckets'', ''DELETE'')', false);
END $$;

-- ----------------------------------------------------------------------------
-- PHASE A — anonymous: public objects only; no writes anywhere
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('role', 'anon', true);

  PERFORM public.v0204_count('A.01 anon sees the published object in the public bucket',
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''showcase-public''', 1);
  PERFORM public.v0204_count('A.02 anon sees zero draft-bucket objects',
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''showcase-draft''', 0);

  PERFORM public.v0204_denied('A.03 anon cannot INSERT into the draft bucket',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-draft'', ''portrait/aaaaaaaa-0000-4000-8000-0000000000ff.png'')');
  PERFORM public.v0204_denied('A.04 anon cannot INSERT into the public bucket',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-public'', ''portrait/aaaaaaaa-0000-4000-8000-0000000000fe.png'')');
  PERFORM public.v0204_denied('A.05 anon cannot UPDATE a public object',
    'UPDATE storage.objects SET name = name WHERE bucket_id = ''showcase-public''');
  PERFORM public.v0204_denied('A.06 anon cannot DELETE a public object',
    'DELETE FROM storage.objects WHERE bucket_id = ''showcase-public''');
  PERFORM public.v0204_denied('A.07 anon cannot read storage.buckets',
    'SELECT count(*) FROM storage.buckets');

  EXECUTE 'RESET ROLE';
END $$;

-- ----------------------------------------------------------------------------
-- PHASE B — ordinary authenticated (not the admin): published reads only
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222202', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.v0204_count('B.01 non-admin sees the public-bucket object',
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''showcase-public''', 1);
  PERFORM public.v0204_count('B.02 non-admin sees zero draft-bucket objects',
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''showcase-draft''', 0);
  PERFORM public.v0204_denied('B.03 non-admin cannot INSERT into the draft bucket',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-draft'', ''portrait/aaaaaaaa-0000-4000-8000-0000000000fd.png'')');
  PERFORM public.v0204_denied('B.04 non-admin cannot INSERT into the public bucket',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-public'', ''portrait/aaaaaaaa-0000-4000-8000-0000000000fc.png'')');

  EXECUTE 'RESET ROLE';
END $$;

-- ----------------------------------------------------------------------------
-- PHASE C — configured admin: draft control + publish-workflow invariant
-- ----------------------------------------------------------------------------
UPDATE public.admin_identity
   SET admin_user_id = '11111111-1111-4111-8111-111111111101'
 WHERE id = 1;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.v0204_count('C.01 admin sees draft-bucket objects',
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''showcase-draft''', 1);
  PERFORM public.v0204_count('C.02 admin sees public-bucket objects',
    'SELECT count(*) FROM storage.objects WHERE bucket_id = ''showcase-public''', 1);

  -- Draft writes: allowed only with the server-generated name shape.
  PERFORM public.v0204_allowed('C.03 admin may INSERT a correctly named draft object',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-draft'', ''portrait/cccccccc-0000-4000-8000-0000000000c1.png'')');
  PERFORM public.v0204_denied('C.04 admin cannot INSERT a traversal name',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-draft'', ''portrait/../../../etc/passwd'')');
  PERFORM public.v0204_denied('C.05 admin cannot INSERT a disallowed extension',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-draft'', ''portrait/cccccccc-0000-4000-8000-0000000000c2.svg'')');
  PERFORM public.v0204_allowed('C.06 admin may UPDATE a draft object',
    'UPDATE storage.objects SET updated_at = now()
      WHERE bucket_id = ''showcase-draft''
        AND name = ''portrait/aaaaaaaa-0000-4000-8000-0000000000a2.png''');
  PERFORM public.v0204_allowed('C.07 admin may DELETE a draft object',
    'DELETE FROM storage.objects
      WHERE bucket_id = ''showcase-draft''
        AND name = ''portrait/cccccccc-0000-4000-8000-0000000000c1.png''');

  -- Public writes: only when a published media row names the exact bucket+path.
  PERFORM public.v0204_allowed('C.08 admin may publish-copy an object with a matching published media row',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-public'', ''portrait/aaaaaaaa-0000-4000-8000-0000000000b1.png'')');
  PERFORM public.v0204_denied('C.09 admin cannot write a public object with no published media row',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-public'', ''portrait/dddddddd-0000-4000-8000-0000000000d1.png'')');
  PERFORM public.v0204_denied('C.10 a draft media row does not unlock a public write',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-public'', ''portrait/aaaaaaaa-0000-4000-8000-0000000000a2.png'')');
  PERFORM public.v0204_allowed('C.11 admin may DELETE a public object (unpublish cleanup)',
    'DELETE FROM storage.objects
      WHERE bucket_id = ''showcase-public''
        AND name = ''portrait/aaaaaaaa-0000-4000-8000-0000000000a1.png''');
  PERFORM public.v0204_denied('C.12 admin still cannot manage storage.buckets',
    'SELECT count(*) FROM storage.buckets');

  EXECUTE 'RESET ROLE';
END $$;

-- ----------------------------------------------------------------------------
-- PHASE D — service_role (server-side only)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('role', 'service_role', true);

  PERFORM public.v0204_count('D.01 service_role reads all storage objects',
    'SELECT count(*) FROM storage.objects WHERE bucket_id IN (''showcase-public'', ''showcase-draft'')', 2);
  PERFORM public.v0204_allowed('D.02 service_role may write objects',
    'INSERT INTO storage.objects (bucket_id, name)
     VALUES (''showcase-draft'', ''logo/eeeeeeee-0000-4000-8000-0000000000e1.png'')');

  EXECUTE 'RESET ROLE';
END $$;

-- ----------------------------------------------------------------------------
-- Summary
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_failed int; v_total int;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO v_failed, v_total
    FROM public.test_results_0204;
  IF v_failed > 0 THEN
    RAISE EXCEPTION '02-04 verification FAILED: % of % assertion(s) failed', v_failed, v_total
      USING HINT = 'Search the log above for [FAIL] lines.';
  END IF;
  RAISE NOTICE '=== 02-04 verification PASSED: % assertions ===', v_total;
END $$;

ROLLBACK;

\else
\echo 'SKIP [02-04]: storage.buckets/storage.objects are absent on this database, so buckets and storage policies cannot be verified here. Run this file against a project with Supabase Storage enabled.'
\endif
