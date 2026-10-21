-- TUL-1781: talent_profiles INSERT by staff scoped to active editor-or-above members.
-- HELD: lives in _pending_pm; PM applies (never applied by the author). Reserved version 20261231425300.
--
-- PROBLEM: talent_insert_staff (init: is_agency_staff(); 20261231415400 held: caller_is_staff_of_any_tenant())
--   let staff of ANY tenant, viewers included, INSERT rows into the shared talent_profiles table.
--
-- FIX: an authenticated staff insert is allowed only for a platform admin or an ACTIVE member with role
--   owner | admin | manager | coordinator | editor (same role set as is_tenant_writer in 20261231424000).
--   talent_profiles is a global identity table with NO tenant column, so there is no row-level tenant to match:
--   the caller must be an active editor-or-above member of SOME tenant (the same limitation is documented in the PR).
--   The self-insert path (talent_insert_self: user_id = auth.uid()) is a separate policy and is untouched.
--   Service-role inserts bypass RLS and are unaffected.
--
-- Idempotent. Rollback: DROP POLICY talent_insert_staff and re-create it from 20261231415400 (or init).

BEGIN;

DROP POLICY IF EXISTS talent_insert_staff ON public.talent_profiles;
CREATE POLICY talent_insert_staff ON public.talent_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
        FROM public.agency_memberships m
       WHERE m.profile_id = auth.uid()
         AND m.status     = 'active'
         AND m.role IN ('owner', 'admin', 'manager', 'coordinator', 'editor')
    )
  );

COMMIT;
