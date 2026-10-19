-- TUL-1359 SECURITY: talent_profiles_merged_select_public no longer lets staff of ANY agency read
-- every talent. HELD FILE: the Production Migration Manager applies it (staging first); never
-- applied by the author. Follow-up to 20261231415400 (applied on staging + prod).
--
-- ROOT CAUSE: the merged SELECT policy (20260615200005) was
--   USING (user_id = auth.uid() OR (public/approved branch) OR is_agency_staff())
-- and is_agency_staff() is a GLOBAL app_role check. Every self-serve studio owner has it, so
-- staff of agency A could read agency B's unpublished, hidden and soft-deleted talents.
--
-- FIX: drop the global clause. Staff read through talent_select_staff (TO authenticated,
-- USING staff_can_access_talent_profile(id): platform admin OR the talent is on a non-removed
-- roster row of one of the caller's workspaces), which 415400 already created. Policies are
-- permissive and OR together, so own-row + public/approved reads are unchanged, and the
-- DEFINER helper is never evaluated for anon (it is not anon-executable).
--
-- A guard aborts the transaction if the roster-scoped staff policy or helper is missing, so
-- staff can never be left with no path at all.
--
-- ROLLBACK SQL (restores the previous, over-broad policy):
--   BEGIN;
--   DROP POLICY IF EXISTS "talent_profiles_merged_select_public" ON "public"."talent_profiles";
--   CREATE POLICY "talent_profiles_merged_select_public" ON "public"."talent_profiles"
--     AS PERMISSIVE FOR SELECT
--     TO public
--     USING (((user_id = auth.uid())) OR (((deleted_at IS NULL) AND (is_publicly_hidden = false) AND talent_has_public_roster(id))) OR (is_agency_staff()));
--   COMMIT;
--
-- Roll-back-safe validation: run inside BEGIN; ...; ROLLBACK on staging only.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.staff_can_access_talent_profile(uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_can_access_talent_profile(uuid) is missing: apply 20261231415400 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'talent_profiles' AND policyname = 'talent_select_staff'
  ) THEN
    RAISE EXCEPTION 'talent_select_staff policy is missing: apply 20261231415400 first';
  END IF;
END $$;

DROP POLICY IF EXISTS "talent_profiles_merged_select_public" ON "public"."talent_profiles";
CREATE POLICY "talent_profiles_merged_select_public" ON "public"."talent_profiles"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((user_id = auth.uid())) OR (((deleted_at IS NULL) AND (is_publicly_hidden = false) AND talent_has_public_roster(id))));

COMMIT;
