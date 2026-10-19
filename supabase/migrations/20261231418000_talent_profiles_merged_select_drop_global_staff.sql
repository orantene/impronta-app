-- 20261231418000_talent_profiles_merged_select_drop_global_staff.sql
--
-- Follow-up to 20261231415400. That file replaced the global is_agency_staff() with tenant-scoped
-- helpers on the staff policies of profiles / talent_profiles / client_profiles, but left one global
-- clause behind: talent_profiles_merged_select_public still ended in `OR is_agency_staff()`, so any
-- self-serve studio owner (app_role agency_staff) could still read every talent row of every tenant.
--
-- Staff access is already granted by talent_select_staff (TO authenticated,
-- USING staff_can_access_talent_profile(id), added by 415400). Permissive policies are ORed, so the
-- global clause here is redundant for tenant staff and wrong for everyone else. Dropping it leaves:
--   * own row (user_id = auth.uid())
--   * public rows (not deleted, not hidden, on a public roster)
--   * staff of the row's tenant, platform admin: via talent_select_staff
-- Role stays public (anon + authenticated), unchanged, so the public site and directory keep reading.
--
-- DRY RUN (read-only): rows a non-admin studio owner can see today vs after = see the verification
-- in the PR body.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS talent_profiles_merged_select_public ON public.talent_profiles;
--   CREATE POLICY talent_profiles_merged_select_public ON public.talent_profiles
--     FOR SELECT USING (
--       (user_id = auth.uid())
--       OR (deleted_at IS NULL AND is_publicly_hidden = false AND talent_has_public_roster(id))
--       OR is_agency_staff()
--     );

BEGIN;

DROP POLICY IF EXISTS talent_profiles_merged_select_public ON public.talent_profiles;
CREATE POLICY talent_profiles_merged_select_public ON public.talent_profiles
  FOR SELECT USING (
    (user_id = auth.uid())
    OR (deleted_at IS NULL AND is_publicly_hidden = false AND talent_has_public_roster(id))
  );

COMMIT;
