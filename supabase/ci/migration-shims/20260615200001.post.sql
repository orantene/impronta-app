-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20260615200001_drop_deprecated_fields.sql
--
-- WHY IT CANNOT APPLY FROM SCRATCH
--   It applies. What differs is its RESULT. Its three archive tables are
--   created as snapshots of whatever shape their parents had at that instant:
--
--     CREATE TABLE IF NOT EXISTS public._archive_deprecated_field_defs_20260615
--       (LIKE public.profile_field_definitions INCLUDING DEFAULTS INCLUDING COMMENTS);
--
--   so their columns are a photograph of the parent, and the photograph is
--   taken at a different moment in a version-ordered replay than it was in
--   production. Production had already applied several LATER-stamped files to
--   the parents before this one ran (the out-of-order push this directory
--   exists for), so production's archives carry columns the replay's do not:
--
--     _archive_deprecated_field_defs_20260615      10 columns short
--     _archive_deprecated_field_recs_20260615       5 columns short
--     _archive_deprecated_field_settings_20260615   3 columns short
--
-- WHAT PRODUCTION STATE IT REPRODUCES
--   The archives' production shape, as recorded in
--   web/src/lib/supabase/database.types.ts (generated FROM production). Every
--   column below is copied from the migration that adds it to the PARENT —
--   same type, same nullability, same default — and each is named with that
--   migration. Nothing is invented: if a column is not in both the types file
--   and a parent-side migration, it is not here.
--
--   FKs are deliberately absent, which is this migration's own rule:
--     "We intentionally use INCLUDING DEFAULTS INCLUDING COMMENTS rather than
--      INCLUDING ALL so that FK constraints are NOT copied into the archive
--      tables."
--   So field_group_id below is a bare uuid, exactly as LIKE would have left it.
--
--   NOT reproduced, and not claimed: COLUMN ORDER. LIKE copies the parent's
--   ordinal order, and the generator sorts alphabetically, so the snapshot
--   carries no evidence of production's ordering. These columns are appended.
--
--   Rows are untouched. The archives are created empty by the replay and stay
--   empty — there is no production data here to copy, and none is invented.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── _archive_deprecated_field_defs_20260615 ← profile_field_definitions ─────
ALTER TABLE public._archive_deprecated_field_defs_20260615
  -- 20260527063534_tenant_taxonomy_overrides_and_canonical_surface_columns.sql
  --   ADD COLUMN IF NOT EXISTS show_in_directory_filter boolean NOT NULL DEFAULT false,
  --   ADD COLUMN IF NOT EXISTS show_in_directory_card boolean NOT NULL DEFAULT false,
  --   ADD COLUMN IF NOT EXISTS show_in_public_profile_sidebar boolean NOT NULL DEFAULT false;
  ADD COLUMN IF NOT EXISTS show_in_directory_filter       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_directory_card         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_public_profile_sidebar boolean NOT NULL DEFAULT false,
  -- 20260907170000_field_reconciliation_v1.sql
  --   ADD COLUMN IF NOT EXISTS legacy_field_keys TEXT[] DEFAULT '{}';
  ADD COLUMN IF NOT EXISTS legacy_field_keys text[] DEFAULT '{}',
  -- 20260907180000_field_architecture_v1.sql
  --   ADD COLUMN IF NOT EXISTS field_group_id UUID REFERENCES public.profile_field_groups(id);
  --   ADD COLUMN IF NOT EXISTS validation_rules JSONB;
  --   ADD COLUMN IF NOT EXISTS show_when JSONB;
  ADD COLUMN IF NOT EXISTS field_group_id   uuid,
  ADD COLUMN IF NOT EXISTS validation_rules jsonb,
  ADD COLUMN IF NOT EXISTS show_when        jsonb,
  -- 20260923050000_field_defs_i18n_es.sql
  --   ADD COLUMN IF NOT EXISTS label_es text, ADD COLUMN IF NOT EXISTS helper_es text;
  ADD COLUMN IF NOT EXISTS label_es  text,
  ADD COLUMN IF NOT EXISTS helper_es text,
  -- 20260923060000_field_defs_unit.sql
  --   ADD COLUMN IF NOT EXISTS unit text;
  ADD COLUMN IF NOT EXISTS unit text;

-- ── _archive_deprecated_field_recs_20260615 ← profile_field_recommendations ─
-- All five from 20260907180000_field_architecture_v1.sql, which adds them in
-- one statement, every one `BOOLEAN NOT NULL DEFAULT false`.
ALTER TABLE public._archive_deprecated_field_recs_20260615
  ADD COLUMN IF NOT EXISTS required_at_registration     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_before_publish      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_before_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_admin_only                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_verification        boolean NOT NULL DEFAULT false;

-- ── _archive_deprecated_field_settings_20260615 ← workspace_profile_field_settings
-- All three from 20260527063534, which adds them as bare nullable booleans
-- (an override that is NULL means "inherit the definition's value").
ALTER TABLE public._archive_deprecated_field_settings_20260615
  ADD COLUMN IF NOT EXISTS show_in_directory_filter_override       boolean,
  ADD COLUMN IF NOT EXISTS show_in_directory_card_override         boolean,
  ADD COLUMN IF NOT EXISTS show_in_public_profile_sidebar_override boolean;
