-- Migration: 20260615200001_drop_deprecated_fields
-- Hard-delete profile_field_definitions where deprecated_at IS NOT NULL (~49 rows).
--
-- BLAST RADIUS (pre-migration counts, verified via read-only queries 2026-06-15):
--   • profile_field_definitions to delete:       49
--   • talent_profile_field_values to delete:     97  (all non-null, workflow_state='live')
--       - skills (50 rows, 50 talents)            ← REAL DATA LOSS
--       - physical.height_imperial (47 rows, 47 talents)  ← REAL DATA LOSS
--   • workspace_profile_field_settings to delete: 0
--   • profile_field_recommendations to delete:    9
--
-- All three child tables have ON DELETE CASCADE on field_definition_id, so deleting
-- the parent definitions is sufficient — no explicit child deletes are needed.
-- This migration archives every row before deletion (idempotent guard on archive tables).

BEGIN;

-- ─── 1. ARCHIVE TABLES (create once; idempotent) ──────────────────────────────
-- NOTE: We intentionally use INCLUDING DEFAULTS INCLUDING COMMENTS rather than
-- INCLUDING ALL so that FK constraints are NOT copied into the archive tables.
-- (FK inserts succeed because parent rows still exist at INSERT time, but the FKs
-- would become orphaned after the parent DELETE — omitting them avoids that and
-- keeps the archives as simple data stores.)

CREATE TABLE IF NOT EXISTS public._archive_deprecated_field_defs_20260615
  (LIKE public.profile_field_definitions INCLUDING DEFAULTS INCLUDING COMMENTS);

CREATE TABLE IF NOT EXISTS public._archive_deprecated_field_values_20260615
  (LIKE public.talent_profile_field_values INCLUDING DEFAULTS INCLUDING COMMENTS);

CREATE TABLE IF NOT EXISTS public._archive_deprecated_field_settings_20260615
  (LIKE public.workspace_profile_field_settings INCLUDING DEFAULTS INCLUDING COMMENTS);

CREATE TABLE IF NOT EXISTS public._archive_deprecated_field_recs_20260615
  (LIKE public.profile_field_recommendations INCLUDING DEFAULTS INCLUDING COMMENTS);

-- Lock the archives (RLS on, no policy = no PostgREST access) so they don't
-- re-introduce the rls_disabled_in_public / sensitive-data-exposure lint.
ALTER TABLE public._archive_deprecated_field_defs_20260615 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._archive_deprecated_field_values_20260615 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._archive_deprecated_field_settings_20260615 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._archive_deprecated_field_recs_20260615 ENABLE ROW LEVEL SECURITY;

-- ─── 2. POPULATE ARCHIVES ─────────────────────────────────────────────────────

-- Archive definitions (guard: only rows not yet archived)
INSERT INTO public._archive_deprecated_field_defs_20260615
SELECT pfd.*
FROM public.profile_field_definitions pfd
WHERE pfd.deprecated_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public._archive_deprecated_field_defs_20260615 a WHERE a.id = pfd.id
  );

-- Archive talent values for deprecated fields (guard: only rows not yet archived)
INSERT INTO public._archive_deprecated_field_values_20260615
SELECT tpfv.*
FROM public.talent_profile_field_values tpfv
JOIN public.profile_field_definitions pfd ON pfd.id = tpfv.field_definition_id
WHERE pfd.deprecated_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public._archive_deprecated_field_values_20260615 a WHERE a.id = tpfv.id
  );

-- Archive workspace settings for deprecated fields (guard: only rows not yet archived)
INSERT INTO public._archive_deprecated_field_settings_20260615
SELECT wpfs.*
FROM public.workspace_profile_field_settings wpfs
JOIN public.profile_field_definitions pfd ON pfd.id = wpfs.field_definition_id
WHERE pfd.deprecated_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public._archive_deprecated_field_settings_20260615 a WHERE a.id = wpfs.id
  );

-- Archive recommendations for deprecated fields (guard: only rows not yet archived)
INSERT INTO public._archive_deprecated_field_recs_20260615
SELECT pfr.*
FROM public.profile_field_recommendations pfr
JOIN public.profile_field_definitions pfd ON pfd.id = pfr.field_definition_id
WHERE pfd.deprecated_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public._archive_deprecated_field_recs_20260615 a WHERE a.id = pfr.id
  );

-- ─── 3. DELETE DEPRECATED DEFINITIONS (cascades to children) ─────────────────
-- SCOPED to the 47 deprecated definitions with ZERO talent values (no data loss).
-- DELIBERATELY HELD BACK: 'skills' (50 live values) and 'physical.height_imperial'
-- (47 live values) — deleting these destroys 97 live talent values AND the
-- physical.height_imperial delete fires the sync_talent_height_gender trigger,
-- which recomputes the dedicated height column. Those two require an explicit
-- owner decision (the data must be confirmed superseded first). All 49 are
-- archived above, so the held pair is recoverable if a later decision deletes them.

DELETE FROM public.profile_field_definitions
WHERE deprecated_at IS NOT NULL
  AND field_key NOT IN ('skills', 'physical.height_imperial');

COMMIT;
