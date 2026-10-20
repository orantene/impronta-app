-- TUL-1359 SECURITY: close the global is_agency_staff() clause on talent_profiles SELECT.
-- HELD FILE: the Production Migration Manager applies it (staging first); never applied by the
-- author. Follow-up to 20261231415400 (applied on staging + prod).
--
-- ROOT CAUSE: the merged SELECT policy talent_profiles_merged_select_public (20260615200005) was
--   USING (user_id = auth.uid() OR (public/approved branch) OR is_agency_staff())
-- and is_agency_staff() is a GLOBAL app_role check, so staff of ANY agency read every talent.
--
-- STATE-AWARE (environments differ: staging fxlank has the SPLIT policies talent_select_own /
-- talent_select_public / talent_select_staff and no merged policy; prod may have either shape):
--   1. merged policy present AND its qual contains is_agency_staff(): drop it. Recreate the scoped
--      merged policy (own row + public/approved only) ONLY if the split own/public policies are
--      absent; if they exist the merged one was redundant and is not recreated.
--   2. merged policy absent, or present without is_agency_staff(): no-op, RAISE NOTICE naming
--      the shape found.
-- Staff read through talent_select_staff (TO authenticated, USING staff_can_access_talent_profile(id):
-- platform admin OR the talent is on a non-removed roster row of the caller's workspaces, from 415400).
-- A guard aborts if that policy or helper is missing, so staff are never left with no path.
--
-- ROLLBACK SQL (only meaningful if the NOTICE said the merged policy was dropped; restores the
-- previous over-broad merged policy; skip it if the NOTICE said no-op):
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
DECLARE
  merged_qual text;
  split_present boolean;
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

  SELECT qual INTO merged_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'talent_profiles'
    AND policyname = 'talent_profiles_merged_select_public';

  IF merged_qual IS NULL THEN
    RAISE NOTICE 'TUL-1359 no-op: talent_profiles_merged_select_public does not exist (split policy shape); nothing to change';
    RETURN;
  END IF;
  IF merged_qual NOT ILIKE '%is_agency_staff()%' THEN
    RAISE NOTICE 'TUL-1359 no-op: talent_profiles_merged_select_public exists but has no is_agency_staff() clause; nothing to change';
    RETURN;
  END IF;

  DROP POLICY "talent_profiles_merged_select_public" ON "public"."talent_profiles";

  SELECT count(*) = 2 INTO split_present
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'talent_profiles'
    AND policyname IN ('talent_select_own', 'talent_select_public');

  IF split_present THEN
    RAISE NOTICE 'TUL-1359: dropped merged policy with global is_agency_staff(); split own/public policies exist, merged policy not recreated';
  ELSE
    CREATE POLICY "talent_profiles_merged_select_public" ON "public"."talent_profiles"
      AS PERMISSIVE FOR SELECT
      TO public
      USING (((user_id = auth.uid())) OR (((deleted_at IS NULL) AND (is_publicly_hidden = false) AND talent_has_public_roster(id))));
    RAISE NOTICE 'TUL-1359: replaced merged policy with the scoped version (own row + public/approved); staff via talent_select_staff';
  END IF;
END $$;

COMMIT;
