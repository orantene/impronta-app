-- Field system: per-profile field values (hybrid model).
-- Canonical fields stay on talent_profiles (e.g. location_id). Dynamic fields live here.

BEGIN;
-- Dependency guard: this migration requires the field system core tables.
DO $$
BEGIN
  IF to_regclass('public.field_definitions') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Missing dependency: public.field_definitions',
      DETAIL = 'Apply the field system core migration first (creates public.field_groups + public.field_definitions).',
      HINT = 'Run supabase migrations in timestamp order; ensure 20260409094500_field_system_core.sql has been applied before 20260409096000_field_values_layer.sql.';
  END IF;

  IF to_regclass('public.talent_profiles') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Missing dependency: public.talent_profiles',
      DETAIL = 'field_values stores per-talent profile values.',
      HINT = 'Apply the core schema migration first (creates talent_profiles).';
  END IF;
END
$$;
CREATE TABLE IF NOT EXISTS public.field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES public.field_definitions (id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  value_date DATE,
  value_taxonomy_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (talent_profile_id, field_definition_id)
);
CREATE INDEX IF NOT EXISTS idx_field_values_profile
  ON public.field_values (talent_profile_id);
CREATE INDEX IF NOT EXISTS idx_field_values_definition
  ON public.field_values (field_definition_id);
CREATE INDEX IF NOT EXISTS idx_field_values_definition_number
  ON public.field_values (field_definition_id, value_number);
CREATE INDEX IF NOT EXISTS idx_field_values_definition_date
  ON public.field_values (field_definition_id, value_date);
CREATE INDEX IF NOT EXISTS idx_field_values_definition_taxonomy_gin
  ON public.field_values
  USING GIN (value_taxonomy_ids);
ALTER TABLE public.field_values ENABLE ROW LEVEL SECURITY;
-- Staff: full access
DROP POLICY IF EXISTS field_values_staff_all ON public.field_values;
CREATE POLICY field_values_staff_all ON public.field_values
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
-- Talent: only for their own profile, and only for fields editable by talent.
DROP POLICY IF EXISTS field_values_talent_select_own_editable ON public.field_values;
CREATE POLICY field_values_talent_select_own_editable ON public.field_values
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      JOIN public.field_definitions d ON d.id = field_definition_id
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
        AND d.editable_by_talent = TRUE
        AND d.archived_at IS NULL
        AND d.active = TRUE
    )
  );
DROP POLICY IF EXISTS field_values_talent_insert_own_editable ON public.field_values;
CREATE POLICY field_values_talent_insert_own_editable ON public.field_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      JOIN public.field_definitions d ON d.id = field_definition_id
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
        AND d.editable_by_talent = TRUE
        AND d.archived_at IS NULL
        AND d.active = TRUE
    )
  );
DROP POLICY IF EXISTS field_values_talent_update_own_editable ON public.field_values;
CREATE POLICY field_values_talent_update_own_editable ON public.field_values
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      JOIN public.field_definitions d ON d.id = field_definition_id
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
        AND d.editable_by_talent = TRUE
        AND d.archived_at IS NULL
        AND d.active = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      JOIN public.field_definitions d ON d.id = field_definition_id
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
        AND d.editable_by_talent = TRUE
        AND d.archived_at IS NULL
        AND d.active = TRUE
    )
  );
DROP POLICY IF EXISTS field_values_talent_delete_own_editable ON public.field_values;
CREATE POLICY field_values_talent_delete_own_editable ON public.field_values
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      JOIN public.field_definitions d ON d.id = field_definition_id
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
        AND d.editable_by_talent = TRUE
        AND d.archived_at IS NULL
        AND d.active = TRUE
    )
  );
-- Public: allow reading values that are explicitly marked public/profile-visible,
-- and only for profiles that are approved + public.
DROP POLICY IF EXISTS field_values_public_select ON public.field_values;
CREATE POLICY field_values_public_select ON public.field_values
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      JOIN public.field_definitions d ON d.id = field_definition_id
      WHERE t.id = talent_profile_id
        AND t.deleted_at IS NULL
        AND t.workflow_status = 'approved'
        AND t.visibility = 'public'
        AND d.archived_at IS NULL
        AND d.active = TRUE
        AND d.public_visible = TRUE
        AND d.internal_only = FALSE
        AND d.profile_visible = TRUE
    )
  );
COMMIT;
