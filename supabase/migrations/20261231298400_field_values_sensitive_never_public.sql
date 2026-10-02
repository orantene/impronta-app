-- Sensitive profile fields are never publicly readable.
--
-- The public branch of talent_profile_field_values' read policy trusted
-- COALESCE(visibility_override, default_visibility), and a talent can set
-- visibility_override = {public} on any editable field. For a field marked
-- is_sensitive (weight, allergies, tattoos note, and from 20261231298300 the
-- professional licence number) that meant a direct anonymous read could return
-- it, even though the public profile page hides it. On 2026-09-29 no sensitive
-- value was publicly readable (checked: 0 rows), so this closes a latent hole.
--
-- The policy below is the live policy (pg_policies, 2026-09-29) verbatim, with
-- one added condition in the public branch: AND NOT pfd.is_sensitive.
-- The owner branch (talent reads own values) and the staff branch are unchanged.

BEGIN;

DROP POLICY IF EXISTS "talent_profile_field_values_merged_select_public" ON public.talent_profile_field_values;
CREATE POLICY "talent_profile_field_values_merged_select_public" ON public.talent_profile_field_values
  FOR SELECT
  TO public
  USING (
    (EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_field_values.talent_profile_id
         AND tp.user_id = auth.uid()
    ))
    OR (
      talent_profile_field_values.workflow_state = 'live'
      AND EXISTS (
        SELECT 1 FROM public.talent_profiles tp
         WHERE tp.id = talent_profile_field_values.talent_profile_id
           AND tp.deleted_at IS NULL
           AND tp.is_publicly_hidden = false
           AND public.talent_is_site_visible_anywhere(tp.id)
      )
      AND EXISTS (
        SELECT 1 FROM public.profile_field_definitions pfd
         WHERE pfd.id = talent_profile_field_values.field_definition_id
           AND NOT pfd.is_sensitive
           AND 'public' = ANY (COALESCE(talent_profile_field_values.visibility_override, pfd.default_visibility))
      )
    )
    OR (
      talent_profile_field_values.tenant_id IS NOT NULL
      AND public.is_staff_of_tenant(talent_profile_field_values.tenant_id)
    )
  );

COMMIT;
