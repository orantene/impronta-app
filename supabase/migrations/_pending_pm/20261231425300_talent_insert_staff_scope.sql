-- TUL-1781: remove the staff INSERT policy on talent_profiles (no replacement).
-- HELD: lives in _pending_pm; PM applies (never applied by the author). Reserved version 20261231425300.
--
-- PROBLEM: talent_insert_staff (init: is_agency_staff(); 20261231415400 held: caller_is_staff_of_any_tenant())
--   let staff of ANY tenant, viewers included, INSERT rows into the shared talent_profiles table.
--
-- FIX (PM decision): drop it with no replacement. Every app insert into talent_profiles is on the service-role
--   client (bypasses RLS) or inside SECURITY DEFINER onboarding RPCs, so no user session needs a staff INSERT
--   policy. An "editor of some tenant" policy would still let an editor of tenant A create unscoped talents.
--   talent_insert_self (user_id = auth.uid()) is a separate policy and is untouched.
--
-- Idempotent. Rollback: re-create talent_insert_staff from 20261231415400 (or init).

BEGIN;

DROP POLICY IF EXISTS talent_insert_staff ON public.talent_profiles;

COMMIT;
