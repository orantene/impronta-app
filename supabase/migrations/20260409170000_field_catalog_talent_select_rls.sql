-- Allow authenticated users to read field catalog rows (field_groups + field_definitions).
--
-- These are admin-managed catalog/config rows, not user-owned data.
-- Previously only is_agency_staff() could SELECT them, which meant:
--   1. Talent nav queries returned empty (no dynamic profile groups)
--   2. JOINs inside field_values RLS policies could not resolve definitions
--
-- We grant broad authenticated SELECT here because:
--   - App-level queries already apply role-specific filters (editable_by_talent, etc.)
--   - field_values RLS does JOINs on field_definitions — talent must be able to read
--     the definition row for those JOINs to succeed
--   - Restricting to talent-only would break if clients or other roles ever need catalog access

BEGIN;
-- Any authenticated user can read active (non-archived) field groups.
DROP POLICY IF EXISTS field_groups_talent_select_active ON public.field_groups;
DROP POLICY IF EXISTS field_groups_select_authenticated ON public.field_groups;
CREATE POLICY field_groups_select_authenticated ON public.field_groups
  FOR SELECT
  TO authenticated
  USING (archived_at IS NULL);
-- Any authenticated user can read active, non-archived field definitions.
DROP POLICY IF EXISTS field_definitions_talent_select_editable_catalog ON public.field_definitions;
DROP POLICY IF EXISTS field_definitions_select_authenticated ON public.field_definitions;
CREATE POLICY field_definitions_select_authenticated ON public.field_definitions
  FOR SELECT
  TO authenticated
  USING (active = true AND archived_at IS NULL);
COMMIT;
