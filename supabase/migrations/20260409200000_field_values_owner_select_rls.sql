-- Allow profile owners to read all field_values on their talent_profiles row.
-- Complements field_values_talent_select_own_editable (editable scalar fields only).
-- Needed for owner preview (?preview=1) when profile is not yet approved/public.

BEGIN;
DROP POLICY IF EXISTS field_values_owner_select_own ON public.field_values;
CREATE POLICY field_values_owner_select_own ON public.field_values
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );
COMMIT;
