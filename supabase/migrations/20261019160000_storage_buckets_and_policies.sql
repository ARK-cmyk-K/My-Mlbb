-- ----------------------------------------------------------------------------
-- Task 02-04 — Supabase Storage buckets and policies
-- ----------------------------------------------------------------------------
-- Creates the two media buckets and the storage.object RLS policies that keep
-- draft uploads private and expose only genuinely published assets.
--
-- Trust model (see ARCHITECTURE_DECISIONS.md "Security invariants"):
--
--   * `showcase-draft`  — PRIVATE. The only upload target. Reachable by nobody
--     but the configured admin (public.is_admin()). Never public.
--   * `showcase-public` — public READ. By construction it contains only objects
--     referenced by a `public.media` row whose publication_state = 'published'.
--     It is never a direct upload target: only the release publish transaction
--     (task 04-06) may write to it, and the INSERT/UPDATE policy re-checks the
--     published media row. Because a public bucket serves its objects without
--     consulting RLS, that EXISTS check is the load-bearing invariant — see
--     "Publish/unpublish invariant" below.
--
-- Object names are always `<kind>/<uuid>.<ext>` (task 02-04 upload policy,
-- `app/lib/media/upload-policy.ts`). The server generates every segment; the
-- uploader controls none of it, so traversal / absolute paths / collisions are
-- impossible. The pattern is enforced again here in each write policy.
--
-- Publish/unpublish invariant (must be honoured by task 04-06):
--   1. A media row becomes `published` WITH storage_bucket = 'showcase-public'
--      and an object_path that is NOT yet uploaded.
--   2. The publish transaction copies the object from the draft bucket to that
--      path in the public bucket. Only then do the public policies permit the
--      write (the published media row already exists).
--   3. Leaving `published` (unpublish/rollback) MUST delete the public-bucket
--      object, otherwise it remains fetchable through the public URL even
--      though the media row is no longer published. The delete policy allows
--      the admin to do this.
--
-- Foundation re-application: the storage block in
-- 20261019113245_rls_grants_and_policies.sql §8 was skipped in the local
-- sandbox (no service tables). Its statements are re-applied here, idempotently.
--
-- Local application note: this migration only runs its storage statements when
-- `storage.buckets`/`storage.objects` exist. In the current sandbox they do not
-- (older Supabase service migrations never completed; no Docker/Podman/Postgres
-- is available), so the block raises a NOTICE and is skipped. It is therefore
-- IMPLEMENTED_UNVERIFIED until applied to a project — see PROJECT_STATE.md.
-- ----------------------------------------------------------------------------

-- The two buckets and every object policy below depend on the storage service
-- tables. Guard so the migration is a safe no-op on a database without them.
DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL
     OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE '02-04: storage service tables absent — bucket/policy creation skipped. Apply against a project with Supabase Storage enabled, then verify with docs/media-storage-setup.md.';
    RETURN;
  END IF;

  -- ---- 8a. Re-apply the 01-04 storage foundation (idempotent) --------------
  EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY';
  -- Clients never manage buckets through SQL. The app hardcodes bucket ids and
  -- never lists buckets, so bucket administration stays owner/service-role only.
  EXECUTE 'REVOKE ALL ON TABLE storage.buckets FROM anon, authenticated';
  -- Anonymous callers must never create, modify or delete objects.
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE storage.objects FROM anon';

  -- ---- 8b. Minimal, explicit grants (RLS remains the load-bearing gate) ----
  -- Stated so the migration is self-sufficient on a fresh project; re-granting
  -- existing privileges is a no-op. No write privilege is ever given to anon.
  EXECUTE 'GRANT USAGE ON SCHEMA storage TO anon, authenticated';
  EXECUTE 'GRANT SELECT ON TABLE storage.objects TO anon';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE storage.objects TO authenticated';

  -- ---- 8c. Buckets ---------------------------------------------------------
  -- 10 MiB and the four accepted image types are the same rules encoded in
  -- app/lib/media/upload-policy.ts (MAX_MEDIA_UPLOAD_BYTES,
  -- ALLOWED_IMAGE_MIME_TYPES). The Storage API enforces them independently of
  -- the application, so a direct API call cannot exceed or wrong-type a bucket.
  -- SVG is deliberately excluded on both sides (stored-XSS vector).
  EXECUTE $bucket$
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('showcase-public', 'showcase-public', true,  10485760,
       ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
      ('showcase-draft',  'showcase-draft',  false, 10485760,
       ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif'])
    ON CONFLICT (id) DO UPDATE
      SET public             = EXCLUDED.public,
          file_size_limit    = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types
  $bucket$;

  -- ---- 8d. storage.objects policies ---------------------------------------
  -- Name pattern, inlined (kept in sync with MEDIA_OBJECT_PATH_PATTERN):
  --   ^[a-z][a-z_]*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|avif)$
  --
  -- (a) Public published-asset reads. Allowed for anon + authenticated, but
  --     scoped to the public bucket only. The public bucket only ever holds
  --     published objects, so this cannot expose a draft. Draft-bucket rows
  --     match no policy for anon and are therefore invisible.
  EXECUTE 'DROP POLICY IF EXISTS storage_public_objects_read ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY storage_public_objects_read ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = 'showcase-public')
  $policy$;

  -- (b) Draft reads: the configured admin only.
  EXECUTE 'DROP POLICY IF EXISTS storage_draft_objects_admin_read ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY storage_draft_objects_admin_read ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'showcase-draft' AND public.is_admin())
  $policy$;

  -- (c) Draft inserts: admin only, and only under the server-generated name.
  EXECUTE 'DROP POLICY IF EXISTS storage_draft_objects_admin_insert ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY storage_draft_objects_admin_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'showcase-draft'
        AND public.is_admin()
        AND name ~ '^[a-z][a-z_]*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|avif)$'
      )
  $policy$;

  -- (d) Draft updates: admin only, name still constrained.
  EXECUTE 'DROP POLICY IF EXISTS storage_draft_objects_admin_update ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY storage_draft_objects_admin_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'showcase-draft' AND public.is_admin())
      WITH CHECK (
        bucket_id = 'showcase-draft'
        AND public.is_admin()
        AND name ~ '^[a-z][a-z_]*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|avif)$'
      )
  $policy$;

  -- (e) Draft deletes: admin only (e.g. discarding a draft asset).
  EXECUTE 'DROP POLICY IF EXISTS storage_draft_objects_admin_delete ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY storage_draft_objects_admin_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'showcase-draft' AND public.is_admin())
  $policy$;

  -- (f) Public-bucket inserts: publish workflow only. Requires BOTH the admin
  --     and an existing published media row that names this exact bucket+path.
  --     A draft upload can therefore never be written to the public bucket.
  EXECUTE 'DROP POLICY IF EXISTS storage_public_objects_publish_insert ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY storage_public_objects_publish_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'showcase-public'
        AND public.is_admin()
        AND name ~ '^[a-z][a-z_]*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|avif)$'
        AND EXISTS (
          SELECT 1
            FROM public.media m
           WHERE m.storage_bucket = 'showcase-public'
             AND m.object_path = name
             AND m.publication_state = 'published'
        )
      )
  $policy$;

  -- (g) Public-bucket updates: same publish-workflow invariant as (f).
  EXECUTE 'DROP POLICY IF EXISTS storage_public_objects_publish_update ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY storage_public_objects_publish_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'showcase-public' AND public.is_admin())
      WITH CHECK (
        bucket_id = 'showcase-public'
        AND public.is_admin()
        AND name ~ '^[a-z][a-z_]*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|avif)$'
        AND EXISTS (
          SELECT 1
            FROM public.media m
           WHERE m.storage_bucket = 'showcase-public'
             AND m.object_path = name
             AND m.publication_state = 'published'
        )
      )
  $policy$;

  -- (h) Public-bucket deletes: admin only (unpublish / rollback cleanup). This
  --     is required by the invariant: a public object must not outlive its
  --     published media row.
  EXECUTE 'DROP POLICY IF EXISTS storage_public_objects_publish_delete ON storage.objects';
  EXECUTE $policy$
    CREATE POLICY storage_public_objects_publish_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'showcase-public' AND public.is_admin())
  $policy$;

  RAISE NOTICE '02-04: storage buckets and policies applied (showcase-public = published reads only, showcase-draft = admin-only, publish-writes re-check the published media row).';
END
$storage$;

-- Deny-by-default for storage objects created later by this role (carried over
-- from 01-04 §8 so a future service migration cannot silently re-grant).
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Done.
--    Evidence: supabase/tests/02-04_storage_verification.sql (run only on a
--    database that has storage.buckets/storage.objects; skipped here).
--    Manual operator steps: docs/media-storage-setup.md.
-- ----------------------------------------------------------------------------
