-- Public catalog read: anon can SELECT active, non-internal field schema rows.
-- Enables directory/embeds and any server route using the anon key to resolve
-- field_definitions when joining from field_values (see P2-C).

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
