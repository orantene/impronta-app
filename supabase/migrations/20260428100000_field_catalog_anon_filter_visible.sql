-- Broaden anon read policy on field_definitions:
-- Fields with directory_filter_visible=true must be readable by the anon key so
-- the public directory sidebar can show filter categories (e.g. Gender, Date of birth)
-- even when those fields are internal_only=true on profile pages.
-- internal_only controls whether a field value is shown on public talent profiles —
-- it should NOT block the filter category label/options from appearing in the sidebar.

BEGIN;

DROP POLICY IF EXISTS field_definitions_anon_select_catalog ON public.field_definitions;
CREATE POLICY field_definitions_anon_select_catalog ON public.field_definitions
  FOR SELECT
  TO anon
  USING (
    active = true
    AND archived_at IS NULL
    AND (internal_only = false OR directory_filter_visible = true)
  );

COMMIT;
