-- ============================================================================
-- Migration: 20261019140000 — Published Search RPC and Trigonometric Indexes
-- Task:      01-05 — Published-content search RPC and indexes
-- Author:    implementation agent, 2026-10-19
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enable pg_trgm extension for typo-tolerant similarity matching
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- 2. Create the search_published_content RPC
--
-- Design decisions (invoker-safe, no SECURITY DEFINER):
--   * Function runs with the caller's session privileges.
--     anon has SELECT on the four published_* projection tables (granted by 01-04),
--     so the function can safely query them without elevated privileges.
--   * search_path is set to 'public' so pg_trgm's similarity() and % operator
--     resolve without schema prefixes, while all table names are still fully
--     qualified as public.published_* for clarity and safety.
--   * No dynamic SQL is used; all queries are static and use only the published
--     projection tables that anon is explicitly granted to read.
--   * Returns jsonb with categorized results: heroes, skins, achievements,
--     timeline_entries. Each result item has a stable id and concise display fields.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_published_content(
  p_query text,
  p_limit integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS
$$
DECLARE
  v_query text := p_query;
  v_limit integer := least(greatest(p_limit, 1), 50); -- clamp [1..50]
  v_heroes jsonb := '[]'::jsonb;
  v_skins jsonb := '[]'::jsonb;
  v_achievements jsonb := '[]'::jsonb;
  v_timeline_entries jsonb := '[]'::jsonb;
BEGIN
  -- Handle empty, null, or very short queries immediately
  IF v_query IS NULL OR trim(v_query) = '' OR char_length(trim(v_query)) < 2 THEN
    RETURN jsonb_build_object(
      'heroes', v_heroes,
      'skins', v_skins,
      'achievements', v_achievements,
      'timeline_entries', v_timeline_entries
    );
  END IF;

  -- ---- Search published heroes by name/slug using pg_trgm similarity --------
  -- The % operator (pg_trgm) filters rows with similarity >= 0.3,
  -- providing typo-tolerant matching.  Results are ranked by similarity DESC.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id::text,
    'title', name,
    'subtitle', primary_role
  ) ORDER BY similarity(name, v_query) DESC), '[]'::jsonb)
  INTO v_heroes
  FROM public.published_heroes
  WHERE name % v_query OR slug % v_query;

  -- ---- Search published skins by name/slug --------------------------------
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id::text,
    'title', name,
    'subtitle', rarity::text
  ) ORDER BY similarity(name, v_query) DESC), '[]'::jsonb)
  INTO v_skins
  FROM public.published_skins
  WHERE name % v_query OR slug % v_query;

  -- ---- Search published achievements by title/description -----------------
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id::text,
    'title', title,
    'subtitle', category::text
  ) ORDER BY similarity(title, v_query) DESC), '[]'::jsonb)
  INTO v_achievements
  FROM public.published_achievements
  WHERE title % v_query OR description % v_query;

  -- ---- Search published timeline entries by title/body --------------------
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id::text,
    'title', title,
    'subtitle', kind::text
  ) ORDER BY similarity(title, v_query) DESC), '[]'::jsonb)
  INTO v_timeline_entries
  FROM public.published_timeline_entries
  WHERE title % v_query OR body % v_query;

  -- Return the categorized result
  RETURN jsonb_build_object(
    'heroes', v_heroes,
    'skins', v_skins,
    'achievements', v_achievements,
    'timeline_entries', v_timeline_entries
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. GIN trigram indexes for pg_trgm speed on searchable columns
-- ----------------------------------------------------------------------------
-- published_heroes: name and slug are the primary search targets
CREATE INDEX IF NOT EXISTS idx_published_heroes_search
  ON public.published_heroes USING gin (name gin_trgm_ops, slug gin_trgm_ops);

-- published_skins: name and slug
CREATE INDEX IF NOT EXISTS idx_published_skins_search
  ON public.published_skins USING gin (name gin_trgm_ops, slug gin_trgm_ops);

-- published_achievements: title and description
CREATE INDEX IF NOT EXISTS idx_published_achievements_search
  ON public.published_achievements USING gin (title gin_trgm_ops, description gin_trgm_ops);

-- published_timeline_entries: title and body
CREATE INDEX IF NOT EXISTS idx_published_timeline_entries_search
  ON public.published_timeline_entries USING gin (title gin_trgm_ops, body gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 4. Grant EXECUTE on the search RPC to anon only (deny-by-default)
--    Pattern (required by 01-04/01-06 checklist): after creating a new
--    function, explicitly revoke the default PUBLIC/anon EXECUTE privilege
--    (PostgreSQL's built-in PUBLIC EXECUTE cannot be removed by ALTER
--    DEFAULT PRIVILEGES alone), then grant only to the roles that may call it.
--    anon has SELECT on the four published_* projection tables (granted by 01-04),
--    so the function can safely query them with invoker privileges.
-- ----------------------------------------------------------------------------
-- Remove default PUBLIC/anon EXECUTE (built-in grant merged with pg_default_acl)
REVOKE EXECUTE ON FUNCTION public.search_published_content(text, integer) FROM PUBLIC, anon;
-- Grant EXECUTE solely to anon for the public read path
GRANT EXECUTE ON FUNCTION public.search_published_content(text, integer) TO anon;

-- ----------------------------------------------------------------------------
-- 5. Verification notes (documented alongside, not executed as migration SQL):
--    * anon CAN execute the function and receives categorized published results only.
--    * Draft tables (heroes, skins, achievements, timeline_entries in the draft
--      working set) are never queried, so draft data cannot leak through this RPC.
--    * No private columns (created_by, updated_by, checksum_sha256, note,
--      scheduled_for, source_snapshot_id) are included in the result shape.
--    * Result types and fields:
--        heroes:      id, title (name), subtitle (primary_role)
--        skins:       id, title (name), subtitle (rarity)
--        achievements: id, title, subtitle (category)
--        timeline_entries: id, title, subtitle (kind)
--    * Queries shorter than 2 characters return empty arrays for all types.
--    * Input validation clamps p_limit to [1..50] and rejects null/empty/
--      short queries with empty results.
--    * The function is invoker-safe: it runs with the caller's session
--      privileges.  anon has SELECT on the four published_* projection tables
--      (granted by 01-04) and EXECUTE on this function (granted by this
--      migration).  No SECURITY DEFINER is used, so the function cannot elevate
--      privileges or access tables beyond what anon is already granted to read.
-- ----------------------------------------------------------------------------