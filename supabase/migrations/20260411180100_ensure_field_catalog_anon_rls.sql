-- Repair: public directory reads field_definitions with the anon key. If this policy is missing,
-- PostgREST returns zero rows and /directory filters stay empty (taxonomy_terms/locations still work).

BEGIN;
DROP POLICY IF EXISTS field_groups_anon_select_catalog ON public.field_groups;
CREATE POLICY field_groups_anon_select_catalog ON public.field_groups
  FOR SELECT
  TO anon
  USING (archived_at IS NULL);
DROP POLICY IF EXISTS field_definitions_anon_select_catalog ON public.field_definitions;
CREATE POLICY field_definitions_anon_select_catalog ON public.field_definitions
  FOR SELECT
  TO anon
  USING (
    active = true
    AND archived_at IS NULL
    AND internal_only = false
  );
COMMIT;
