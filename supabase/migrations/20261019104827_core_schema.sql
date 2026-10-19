-- ============================================================================
-- Migration: 20261019104827_core_schema
-- Task:      01-03 — Core Supabase Database Schema (MLBB Showcase)
-- Author:    implementation agent, 2026-10-19
--
-- PURPOSE
-- Versioned, additive (non-destructive) core data model:
--   * draft working set:      heroes, skins, account_stats, achievements,
--                             timeline_entries, appearance_settings,
--                             homepage_sections
--   * shared media metadata:  media
--   * release management:     releases, release_snapshots (immutable)
--   * published projection:   published_heroes, published_skins,
--                             published_achievements, published_timeline_entries
--
-- PUBLICATION MODEL (design note for tasks 01-04, 02-03, 03-01..03-06, 04-05/04-06)
-- The draft tables are the admin working set and are never exposed to anonymous
-- roles.  Publishing (04-06) transactionally:
--   1. copies the current draft content into the `published_*` tables, and
--   2. freezes the full published state as an immutable JSONB payload in
--      `release_snapshots`, and
--   3. points the single `releases` row with status='published' at that release.
-- Rationale: a single table with a `publication_state` column cannot honour the
-- specification requirement that "draft edits do not alter public content
-- before publication" (task 03-02) without per-row versioning that would break
-- cross-table foreign keys.  The projection keeps foreign keys stable, gives
-- RLS a trivial and reliable separation (anon may only ever be granted access
-- to `published_*` tables), and gives search (01-05) real columns to index.
-- `publication_state` on draft rows is the per-row lifecycle marker
-- (draft → published → archived) used by the dashboard; it is NOT the public
-- read path.  Configuration rows (account stats, appearance, homepage
-- sections) are published inside the snapshot payload; public pages read them
-- through the published-release service (02-03 / 04-01), not from live rows.
--
-- SECURITY POSTURE (baseline for task 01-04)
-- * RLS is ENABLED on every table with NO policies, so anon/authenticated are
--   denied by default even where Supabase default privileges or the local
--   `auto_expose_new_tables` setting would otherwise grant table access.
-- * Explicit REVOKEs from anon and authenticated are applied to every table.
--   No GRANTs are added here; least-privilege grants belong to task 01-04.
-- * Actor columns (created_by/updated_by) reference auth.users(id) and are
--   populated server-side from auth.uid(); no secrets or service-role usage.
-- * All media referenced by content is protected with ON DELETE RESTRICT.
-- * release rows and snapshots are protected with ON DELETE RESTRICT so
--   release history cannot be silently destroyed.
--
-- CONVENTIONS
-- * uuid primary keys (gen_random_uuid(), built in since PostgreSQL 13).
-- * timestamptz for instants, date for day-granularity milestones.
-- * Enums for fixed vocabularies; CHECK constraints for ranges/formats.
-- * updated_at maintained by the set_updated_at() trigger.
-- * This migration is applied once, in order, by the Supabase migration
--   workflow (`supabase db reset` locally, `supabase db push` for a hosted
--   project); re-running is tracked by supabase_migrations.schema_migrations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enumerations
-- ----------------------------------------------------------------------------
CREATE TYPE public.publication_state   AS ENUM ('draft', 'published', 'archived');
CREATE TYPE public.hero_role           AS ENUM ('tank', 'fighter', 'assassin', 'mage', 'marksman', 'support');
CREATE TYPE public.skin_rarity         AS ENUM ('basic', 'elite', 'special', 'starlight', 'epic', 'legend', 'collector');
CREATE TYPE public.skin_variant        AS ENUM ('model', 'painted', 'other');
CREATE TYPE public.media_kind          AS ENUM ('avatar', 'portrait', 'splash_art', 'thumbnail', 'badge', 'logo', 'other');
CREATE TYPE public.achievement_category AS ENUM ('rank', 'gameplay', 'event', 'career', 'collection', 'other');
CREATE TYPE public.timeline_kind       AS ENUM ('milestone', 'event', 'achievement', 'release', 'update');
CREATE TYPE public.release_status      AS ENUM ('draft', 'scheduled', 'published', 'archived');

COMMENT ON TYPE public.publication_state IS
  'Row lifecycle in the draft working set: draft (editable, never published), published (current draft content matches the active release), archived (retained for history, hidden from the dashboard lists).';
COMMENT ON TYPE public.release_status IS
  'Release lifecycle: draft (being prepared), scheduled (pending scheduled_for), published (the single active public release), archived (previously published, superseded or rolled back from).';

-- ----------------------------------------------------------------------------
-- 2. Shared trigger helpers
-- ----------------------------------------------------------------------------
CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.set_updated_at() IS
  'BEFORE UPDATE trigger helper that stamps updated_at. SECURITY INVOKER with an empty search_path; contains no dynamic SQL.';

CREATE FUNCTION public.reject_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'release_snapshots is append-only: % is not allowed', TG_OP
    USING HINT = 'Create a new snapshot (and release) instead of modifying or deleting history.';
END;
$$;
COMMENT ON FUNCTION public.reject_snapshot_mutation() IS
  'BEFORE UPDATE OR DELETE trigger on release_snapshots enforcing snapshot immutability (release history must never be silently rewritten, per ARCHITECTURE_DECISIONS.md).';

-- ----------------------------------------------------------------------------
-- 3. Media metadata (shared by draft and published content)
-- ----------------------------------------------------------------------------
CREATE TABLE public.media (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_bucket   text NOT NULL,
  object_path      text NOT NULL,
  kind             public.media_kind NOT NULL DEFAULT 'other',
  mime_type        text NOT NULL,
  byte_size        bigint NOT NULL,
  width_px         integer,
  height_px        integer,
  checksum_sha256  text,
  alt_text         text,
  publication_state public.publication_state NOT NULL DEFAULT 'draft',
  created_by       uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_bucket_format
    CHECK (storage_bucket ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  CONSTRAINT media_object_path_format
    CHECK (object_path <> '' AND length(object_path) <= 1024
           AND object_path !~ '^\.' AND object_path !~ '/\.\.'),
  CONSTRAINT media_mime_type_format
    CHECK (mime_type ~ '^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'),
  CONSTRAINT media_byte_size_positive CHECK (byte_size > 0),
  CONSTRAINT media_width_positive     CHECK (width_px IS NULL OR width_px > 0),
  CONSTRAINT media_height_positive    CHECK (height_px IS NULL OR height_px > 0),
  CONSTRAINT media_checksum_format
    CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT media_alt_text_length CHECK (alt_text IS NULL OR length(alt_text) <= 300)
);
CREATE UNIQUE INDEX uq_media_bucket_path   ON public.media (storage_bucket, object_path);
CREATE INDEX        idx_media_pub_state    ON public.media (publication_state);
COMMENT ON TABLE public.media IS
  'Media metadata registry (task 01-03; upload flows arrive with 02-04/03-xx). object_path is the Storage object key. publication_state gates anonymous readability in 01-04: anon may read only deliberately published media. ON DELETE RESTRICT from every referencing table prevents accidental deletion of media still used by content.';
COMMENT ON COLUMN media.publication_state IS
  'Set to published by the publish workflow for media referenced by published content; draft/private media stays draft and must never be anonymously readable.';

-- ----------------------------------------------------------------------------
-- 4. Draft working set: heroes
-- ----------------------------------------------------------------------------
CREATE TABLE public.heroes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text NOT NULL,
  primary_role      public.hero_role NOT NULL,
  secondary_role    public.hero_role,
  specialty         text,
  portrait_media_id uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  mastery_level     integer NOT NULL DEFAULT 0,
  total_matches     integer NOT NULL DEFAULT 0,
  win_rate          numeric(5,2),
  is_signature      boolean NOT NULL DEFAULT false,
  is_favorite       boolean NOT NULL DEFAULT false,
  publication_state public.publication_state NOT NULL DEFAULT 'draft',
  archived_at       timestamptz,
  created_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT heroes_name_length   CHECK (btrim(name) <> '' AND length(name) <= 120),
  CONSTRAINT heroes_slug_format   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 140),
  CONSTRAINT heroes_secondary_role_differs CHECK (secondary_role IS NULL OR secondary_role <> primary_role),
  CONSTRAINT heroes_specialty_length CHECK (specialty IS NULL OR (btrim(specialty) <> '' AND length(specialty) <= 120)),
  CONSTRAINT heroes_mastery_level_range CHECK (mastery_level BETWEEN 0 AND 100),
  CONSTRAINT heroes_total_matches_nonnegative CHECK (total_matches >= 0),
  CONSTRAINT heroes_win_rate_range CHECK (win_rate IS NULL OR win_rate BETWEEN 0 AND 100),
  CONSTRAINT heroes_archive_marker CHECK ((publication_state = 'archived') = (archived_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_heroes_slug ON public.heroes (slug);
CREATE INDEX idx_heroes_pub_state  ON public.heroes (publication_state);
COMMENT ON TABLE public.heroes IS
  'Draft working set of heroes (admin only). Public pages never read this table; they read the published projection created by the publish workflow (04-06).';

-- ----------------------------------------------------------------------------
-- 5. Draft working set: skins
-- ----------------------------------------------------------------------------
CREATE TABLE public.skins (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 text NOT NULL,
  hero_id              uuid REFERENCES public.heroes (id) ON DELETE RESTRICT,
  rarity               public.skin_rarity NOT NULL,
  series               text,
  splash_art_media_id  uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  variant              public.skin_variant,
  acquisition_date     date,
  acquisition_milestone text,
  is_owned             boolean NOT NULL DEFAULT false,
  is_favorite          boolean NOT NULL DEFAULT false,
  publication_state    public.publication_state NOT NULL DEFAULT 'draft',
  archived_at          timestamptz,
  created_by           uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skins_name_length  CHECK (btrim(name) <> '' AND length(name) <= 120),
  CONSTRAINT skins_slug_format  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 140),
  CONSTRAINT skins_series_length CHECK (series IS NULL OR (btrim(series) <> '' AND length(series) <= 160)),
  CONSTRAINT skins_acquisition_date_range
    CHECK (acquisition_date IS NULL OR acquisition_date BETWEEN DATE '2010-01-01' AND DATE '2100-12-31'),
  CONSTRAINT skins_acquisition_milestone_length
    CHECK (acquisition_milestone IS NULL OR (btrim(acquisition_milestone) <> '' AND length(acquisition_milestone) <= 160)),
  CONSTRAINT skins_archive_marker CHECK ((publication_state = 'archived') = (archived_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_skins_slug      ON public.skins (slug);
CREATE INDEX        idx_skins_hero_id  ON public.skins (hero_id);
CREATE INDEX        idx_skins_pub_state ON public.skins (publication_state);
COMMENT ON TABLE public.skins IS
  'Draft working set of skins (admin only). hero_id may be NULL for account-wide or unassigned entries. Deleting a hero that is still referenced by skins is blocked (ON DELETE RESTRICT).';

-- ----------------------------------------------------------------------------
-- 6. Draft working set: achievements
-- ----------------------------------------------------------------------------
CREATE TABLE public.achievements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  category          public.achievement_category NOT NULL DEFAULT 'other',
  earned_on         date,
  icon_media_id     uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  publication_state public.publication_state NOT NULL DEFAULT 'draft',
  archived_at       timestamptz,
  created_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievements_title_length  CHECK (btrim(title) <> '' AND length(title) <= 140),
  CONSTRAINT achievements_description_length CHECK (description IS NULL OR length(description) <= 1000),
  CONSTRAINT achievements_earned_on_range
    CHECK (earned_on IS NULL OR earned_on BETWEEN DATE '2010-01-01' AND DATE '2100-12-31'),
  CONSTRAINT achievements_archive_marker CHECK ((publication_state = 'archived') = (archived_at IS NOT NULL))
);
CREATE INDEX idx_achievements_pub_state ON public.achievements (publication_state);
CREATE INDEX idx_achievements_earned_on ON public.achievements (earned_on DESC NULLS LAST);
COMMENT ON TABLE public.achievements IS
  'Draft working set of achievements (admin only). earned_on NULL means the exact date is unknown; display code must label it rather than invent a value.';

-- ----------------------------------------------------------------------------
-- 7. Draft working set: timeline entries
-- ----------------------------------------------------------------------------
CREATE TABLE public.timeline_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  body              text,
  kind              public.timeline_kind NOT NULL DEFAULT 'milestone',
  occurred_on       date NOT NULL,
  media_id          uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  is_highlight      boolean NOT NULL DEFAULT false,
  publication_state public.publication_state NOT NULL DEFAULT 'draft',
  archived_at       timestamptz,
  created_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timeline_entries_title_length CHECK (btrim(title) <> '' AND length(title) <= 140),
  CONSTRAINT timeline_entries_body_length  CHECK (body IS NULL OR length(body) <= 2000),
  CONSTRAINT timeline_entries_occurred_on_range
    CHECK (occurred_on BETWEEN DATE '2010-01-01' AND DATE '2100-12-31'),
  CONSTRAINT timeline_entries_archive_marker CHECK ((publication_state = 'archived') = (archived_at IS NOT NULL))
);
CREATE INDEX idx_timeline_entries_pub_state  ON public.timeline_entries (publication_state);
CREATE INDEX idx_timeline_entries_occurred_on ON public.timeline_entries (occurred_on DESC);
COMMENT ON TABLE public.timeline_entries IS
  'Draft working set of milestone timeline entries (admin only). The date range check reflects Mobile Legends: Bang Bang being released in 2016; 2010 is a tolerant lower bound.';

-- ----------------------------------------------------------------------------
-- 8. Draft working set: account stats (single-row configuration)
-- ----------------------------------------------------------------------------
CREATE TABLE public.account_stats (
  id                 smallint PRIMARY KEY DEFAULT 1,
  display_name       text,
  bio                text,
  avatar_media_id    uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  spotlight_media_id uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  rank_label         text,
  rank_media_id      uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  highest_rank_label text,
  total_matches      integer NOT NULL DEFAULT 0,
  win_rate           numeric(5,2),
  publication_state  public.publication_state NOT NULL DEFAULT 'draft',
  created_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_stats_single_row CHECK (id = 1),
  CONSTRAINT account_stats_display_name_length CHECK (display_name IS NULL OR (btrim(display_name) <> '' AND length(display_name) <= 80)),
  CONSTRAINT account_stats_bio_length CHECK (bio IS NULL OR length(bio) <= 500),
  CONSTRAINT account_stats_rank_label_length CHECK (rank_label IS NULL OR (btrim(rank_label) <> '' AND length(rank_label) <= 60)),
  CONSTRAINT account_stats_highest_rank_label_length CHECK (highest_rank_label IS NULL OR (btrim(highest_rank_label) <> '' AND length(highest_rank_label) <= 60)),
  CONSTRAINT account_stats_total_matches_nonnegative CHECK (total_matches >= 0),
  CONSTRAINT account_stats_win_rate_range CHECK (win_rate IS NULL OR win_rate BETWEEN 0 AND 100)
);
COMMENT ON TABLE public.account_stats IS
  'Single-row account presentation data for the spotlight and stats strip (05-02). Enforced singleton via CHECK (id = 1). Public pages read it from the published release payload, never from this draft row. NULL win_rate / rank labels mean "not recorded" and must be shown as unavailable, not invented.';

-- ----------------------------------------------------------------------------
-- 9. Draft working set: appearance settings and homepage sections
-- ----------------------------------------------------------------------------
CREATE TABLE public.appearance_settings (
  id                 smallint PRIMARY KEY DEFAULT 1,
  theme_preset       text NOT NULL DEFAULT 'adaptive',
  primary_accent     text NOT NULL DEFAULT '#8b5cf6',
  secondary_accent   text NOT NULL DEFAULT '#f59e0b',
  typography_scale   numeric(3,2) NOT NULL DEFAULT 1.00,
  container_width_px integer NOT NULL DEFAULT 1200,
  spacing_scale      numeric(3,2) NOT NULL DEFAULT 1.00,
  custom_css         text,
  publication_state  public.publication_state NOT NULL DEFAULT 'draft',
  created_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appearance_settings_single_row CHECK (id = 1),
  CONSTRAINT appearance_settings_theme_preset CHECK (theme_preset IN ('dark', 'light', 'adaptive')),
  CONSTRAINT appearance_settings_primary_accent_format   CHECK (primary_accent ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT appearance_settings_secondary_accent_format CHECK (secondary_accent ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT appearance_settings_typography_scale_range  CHECK (typography_scale BETWEEN 0.75 AND 1.50),
  CONSTRAINT appearance_settings_container_width_range   CHECK (container_width_px BETWEEN 960 AND 1600),
  CONSTRAINT appearance_settings_spacing_scale_range     CHECK (spacing_scale BETWEEN 0.75 AND 1.50),
  CONSTRAINT appearance_settings_custom_css_length       CHECK (custom_css IS NULL OR length(custom_css) <= 20000)
);
COMMENT ON TABLE public.appearance_settings IS
  'Single-row draft appearance configuration (04-01). Hex-only accents and bounded scales are checked here; allowlist validation of presets and safe custom-CSS vetting are enforced in 04-01/04-03. Public pages must read the published copy inside the release snapshot, not this draft row.';

CREATE TABLE public.homepage_sections (
  section_id        text PRIMARY KEY,
  position          integer NOT NULL,
  is_enabled        boolean NOT NULL DEFAULT true,
  publication_state public.publication_state NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_sections_id_format CHECK (section_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT homepage_sections_position_nonnegative CHECK (position >= 0)
);
CREATE UNIQUE INDEX uq_homepage_sections_position ON public.homepage_sections (position);
COMMENT ON TABLE public.homepage_sections IS
  'Draft ordering/visibility of the approved homepage modules (04-02). section_id is restricted by pattern here and validated against the server-side allowlist of approved modules in 04-02; arbitrary component names must never be stored. position is globally unique so ordering is deterministic.';

-- ----------------------------------------------------------------------------
-- 10. Release management: releases and immutable snapshots
-- ----------------------------------------------------------------------------
CREATE TABLE public.releases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  status       public.release_status NOT NULL DEFAULT 'draft',
  note         text,
  scheduled_for timestamptz,
  published_at timestamptz,
  created_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT releases_name_length CHECK (btrim(name) <> '' AND length(name) <= 120),
  CONSTRAINT releases_note_length CHECK (note IS NULL OR length(note) <= 2000),
  CONSTRAINT releases_scheduled_requires_time CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL),
  CONSTRAINT releases_published_requires_time  CHECK (status NOT IN ('published', 'archived') OR published_at IS NOT NULL)
);
-- At most one release may be active (published) at any time.
CREATE UNIQUE INDEX uq_releases_one_published ON public.releases ((1)) WHERE status = 'published';
CREATE UNIQUE INDEX uq_releases_name          ON public.releases (name);
CREATE INDEX        idx_releases_status       ON public.releases (status);
COMMENT ON TABLE public.releases IS
  'Named release metadata (draft/scheduled/published/archived). The partial unique index guarantees at most one active published release. Rollback (04-06) republishes a prior snapshot by re-pointing status while preserving all release rows, so history is never silently destroyed.';

CREATE TABLE public.release_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id            uuid NOT NULL REFERENCES public.releases (id) ON DELETE RESTRICT,
  version               integer NOT NULL,
  label                 text,
  payload               jsonb NOT NULL,
  payload_format_version integer NOT NULL DEFAULT 1,
  checksum_sha256       text NOT NULL,
  created_by            uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_release_snapshots_release_version UNIQUE (release_id, version),
  CONSTRAINT release_snapshots_version_positive CHECK (version >= 1),
  CONSTRAINT release_snapshots_label_length CHECK (label IS NULL OR (btrim(label) <> '' AND length(label) <= 120)),
  CONSTRAINT release_snapshots_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT release_snapshots_payload_format_version_positive CHECK (payload_format_version >= 1),
  CONSTRAINT release_snapshots_checksum_format CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX idx_release_snapshots_release ON public.release_snapshots (release_id);
COMMENT ON TABLE public.release_snapshots IS
  'Immutable, append-only snapshots of a published release: payload holds the complete published state (heroes, skins, account stats, achievements, timeline entries, appearance settings, homepage sections) with payload_format_version describing its shape, plus a sha256 checksum. UPDATE and DELETE are rejected by trigger; releases referencing snapshots cannot be deleted (ON DELETE RESTRICT).';
COMMENT ON COLUMN public.release_snapshots.payload IS
  'Frozen published state as a JSON object. Schema of the object is versioned by payload_format_version and documented with task 04-05; app code must reject unknown format versions.';

-- Rollback/publish provenance: which snapshot this release was published from.
ALTER TABLE public.releases
  ADD COLUMN source_snapshot_id uuid REFERENCES public.release_snapshots (id) ON DELETE SET NULL;
COMMENT ON COLUMN public.releases.source_snapshot_id IS
  'Audit metadata for 04-06: the snapshot this release was published or rolled back from. ON DELETE SET NULL; integrity of the (release, snapshot) pairing is validated in application code because CHECK constraints cannot run subqueries.';

-- ----------------------------------------------------------------------------
-- 11. Published projection (the public read path for searchable content)
-- ----------------------------------------------------------------------------
CREATE TABLE public.published_heroes (
  id                uuid PRIMARY KEY,
  release_id        uuid NOT NULL REFERENCES public.releases (id) ON DELETE RESTRICT,
  name              text NOT NULL,
  slug              text NOT NULL,
  primary_role      public.hero_role NOT NULL,
  secondary_role    public.hero_role,
  specialty         text,
  portrait_media_id uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  mastery_level     integer NOT NULL,
  total_matches     integer NOT NULL,
  win_rate          numeric(5,2),
  is_signature      boolean NOT NULL DEFAULT false,
  is_favorite       boolean NOT NULL DEFAULT false,
  published_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT published_heroes_name_length CHECK (btrim(name) <> '' AND length(name) <= 120),
  CONSTRAINT published_heroes_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 140),
  CONSTRAINT published_heroes_secondary_role_differs CHECK (secondary_role IS NULL OR secondary_role <> primary_role),
  CONSTRAINT published_heroes_mastery_level_range CHECK (mastery_level BETWEEN 0 AND 100),
  CONSTRAINT published_heroes_total_matches_nonnegative CHECK (total_matches >= 0),
  CONSTRAINT published_heroes_win_rate_range CHECK (win_rate IS NULL OR win_rate BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX uq_published_heroes_slug ON public.published_heroes (slug);
CREATE INDEX        idx_published_heroes_release ON public.published_heroes (release_id);
CREATE INDEX        idx_published_heroes_role   ON public.published_heroes (primary_role);
COMMENT ON TABLE public.published_heroes IS
  'Published copy of heroes for the active release. The only intended anonymous read path for hero content (grants added by 01-04). id is preserved from the draft row so public identifiers stay stable across releases.';

CREATE TABLE public.published_skins (
  id                  uuid PRIMARY KEY,
  release_id          uuid NOT NULL REFERENCES public.releases (id) ON DELETE RESTRICT,
  hero_id             uuid REFERENCES public.published_heroes (id) ON DELETE RESTRICT,
  name                text NOT NULL,
  slug                text NOT NULL,
  rarity              public.skin_rarity NOT NULL,
  series              text,
  splash_art_media_id uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  variant             public.skin_variant,
  acquisition_date    date,
  acquisition_milestone text,
  is_owned            boolean NOT NULL DEFAULT false,
  is_favorite         boolean NOT NULL DEFAULT false,
  published_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT published_skins_name_length CHECK (btrim(name) <> '' AND length(name) <= 120),
  CONSTRAINT published_skins_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 140),
  CONSTRAINT published_skins_series_length CHECK (series IS NULL OR length(series) <= 160),
  CONSTRAINT published_skins_acquisition_date_range
    CHECK (acquisition_date IS NULL OR acquisition_date BETWEEN DATE '2010-01-01' AND DATE '2100-12-31'),
  CONSTRAINT published_skins_acquisition_milestone_length
    CHECK (acquisition_milestone IS NULL OR length(acquisition_milestone) <= 160)
);
CREATE UNIQUE INDEX uq_published_skins_slug   ON public.published_skins (slug);
CREATE INDEX        idx_published_skins_release ON public.published_skins (release_id);
CREATE INDEX        idx_published_skins_hero   ON public.published_skins (hero_id);
CREATE INDEX        idx_published_skins_rarity ON public.published_skins (rarity);
COMMENT ON TABLE public.published_skins IS
  'Published copy of skins for the active release. hero_id references published_heroes, so referential integrity between a published skin and its published hero is enforced by the database.';

CREATE TABLE public.published_achievements (
  id             uuid PRIMARY KEY,
  release_id     uuid NOT NULL REFERENCES public.releases (id) ON DELETE RESTRICT,
  title          text NOT NULL,
  description    text,
  category       public.achievement_category NOT NULL,
  earned_on      date,
  icon_media_id  uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  published_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT published_achievements_title_length CHECK (btrim(title) <> '' AND length(title) <= 140),
  CONSTRAINT published_achievements_description_length CHECK (description IS NULL OR length(description) <= 1000),
  CONSTRAINT published_achievements_earned_on_range
    CHECK (earned_on IS NULL OR earned_on BETWEEN DATE '2010-01-01' AND DATE '2100-12-31')
);
CREATE INDEX idx_published_achievements_release ON public.published_achievements (release_id);
CREATE INDEX idx_published_achievements_earned_on ON public.published_achievements (earned_on DESC NULLS LAST);
COMMENT ON TABLE public.published_achievements IS
  'Published copy of achievements for the active release.';

CREATE TABLE public.published_timeline_entries (
  id            uuid PRIMARY KEY,
  release_id    uuid NOT NULL REFERENCES public.releases (id) ON DELETE RESTRICT,
  title         text NOT NULL,
  body          text,
  kind          public.timeline_kind NOT NULL,
  occurred_on   date NOT NULL,
  media_id      uuid REFERENCES public.media (id) ON DELETE RESTRICT,
  is_highlight  boolean NOT NULL DEFAULT false,
  published_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT published_timeline_entries_title_length CHECK (btrim(title) <> '' AND length(title) <= 140),
  CONSTRAINT published_timeline_entries_body_length  CHECK (body IS NULL OR length(body) <= 2000),
  CONSTRAINT published_timeline_entries_occurred_on_range
    CHECK (occurred_on BETWEEN DATE '2010-01-01' AND DATE '2100-12-31')
);
CREATE INDEX idx_published_timeline_entries_release    ON public.published_timeline_entries (release_id);
CREATE INDEX idx_published_timeline_entries_occurred_on ON public.published_timeline_entries (occurred_on DESC);
COMMENT ON TABLE public.published_timeline_entries IS
  'Published copy of timeline entries for the active release.';

-- ----------------------------------------------------------------------------
-- 12. updated_at maintenance triggers (snapshot deliberately excluded)
-- ----------------------------------------------------------------------------
CREATE TRIGGER trg_media_updated_at             BEFORE UPDATE ON public.media              FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_heroes_updated_at            BEFORE UPDATE ON public.heroes             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_skins_updated_at             BEFORE UPDATE ON public.skins              FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_achievements_updated_at      BEFORE UPDATE ON public.achievements       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_timeline_entries_updated_at  BEFORE UPDATE ON public.timeline_entries   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_account_stats_updated_at     BEFORE UPDATE ON public.account_stats      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_appearance_settings_updated_at BEFORE UPDATE ON public.appearance_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_homepage_sections_updated_at BEFORE UPDATE ON public.homepage_sections  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_releases_updated_at          BEFORE UPDATE ON public.releases           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Snapshot immutability (append-only release history).
CREATE TRIGGER trg_release_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.release_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.reject_snapshot_mutation();

-- ----------------------------------------------------------------------------
-- 13. Row Level Security baseline: deny-by-default (policies arrive in 01-04)
-- ----------------------------------------------------------------------------
-- RLS is enabled with NO policies, so anon/authenticated see nothing even if
-- table-level grants exist.  Explicit revokes additionally defend against
-- Supabase default privileges and the local `auto_expose_new_tables` fallback.
-- The postgres owner (server-side migrations, service role) is unaffected.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'media', 'heroes', 'skins', 'achievements', 'timeline_entries',
    'account_stats', 'appearance_settings', 'homepage_sections',
    'releases', 'release_snapshots',
    'published_heroes', 'published_skins', 'published_achievements',
    'published_timeline_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['set_updated_at()', 'reject_snapshot_mutation()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 14. Bootstrap seed rows for singleton configuration (draft space only)
-- ----------------------------------------------------------------------------
INSERT INTO public.account_stats (id) VALUES (1);
INSERT INTO public.appearance_settings (id) VALUES (1);
INSERT INTO public.homepage_sections (section_id, position, is_enabled) VALUES
  ('spotlight',    1, true),
  ('stats',        2, true),
  ('showcase_tabs',3, true),
  ('timeline',     4, true),
  ('explorer',     5, true);
