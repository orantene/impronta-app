-- P0 SECURITY (PR 0b-1): profiles / talent_profiles / client_profiles
-- "no self-promotion, no cross-tenant staff access". HELD FILE: PM applies; never applied by the author.
--
-- ROOT CAUSE (confirmed on staging fxlankepwnvelxjrahwk in a rolled-back transaction):
--   Every self-serve studio owner gets app_role 'agency_staff'. public.is_agency_staff() is a GLOBAL
--   role check. profiles_update_self_or_staff was USING (id = auth.uid() OR is_agency_staff()) with NO
--   WITH CHECK, and the self-update guard trigger skips staff. So an owner could
--     (1) UPDATE their own profiles.app_role to 'super_admin'  (self-promotion), and
--     (2) read and update every other tenant's profiles / talent_profiles / client_profiles.
--
-- FIX (this file, idempotent, one transaction):
--   A. Trigger profiles_protect_role_status: app_role / account_status cannot change from a direct
--      authenticated/anon session unless is_platform_admin(), staff included. SECURITY INVOKER on
--      purpose: current_user is the caller's role for a direct PostgREST UPDATE, but the owner role
--      inside SECURITY DEFINER onboarding RPCs (ensure_profile_for_current_user, complete_*_onboarding)
--      and the service role, so those sanctioned paths keep working.
--   B. profiles update policy gets a WITH CHECK.
--   C. Tenant-scoped replacements for the global is_agency_staff() on profiles, talent_profiles and
--      client_profiles policies: platform admin OR own row OR a row tied to a tenant the caller is a
--      member of (roster / client relationship / inquiry / shared membership). Staff policies are
--      TO authenticated so anon never evaluates the DEFINER helpers (they are not anon-executable).
--
-- Roll-back-safe validation: run inside BEGIN; ...; ROLLBACK on staging only.

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Role / status guard for direct sessions (staff included).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_protect_role_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (NEW.app_role IS DISTINCT FROM OLD.app_role
      OR NEW.account_status IS DISTINCT FROM OLD.account_status)
     AND current_user IN ('authenticated', 'anon')
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'profiles.app_role and profiles.account_status can only be changed by a platform admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_role_status ON public.profiles;
CREATE TRIGGER profiles_protect_role_status
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_role_status();

-- ---------------------------------------------------------------------------
-- C0. Tenant-scoped access helpers (SECURITY DEFINER, not anon-executable).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_can_access_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_profile_id = auth.uid()
    OR public.is_platform_admin()
    OR EXISTS (   -- co-member of one of my workspaces
      SELECT 1 FROM public.agency_memberships m
      WHERE m.profile_id = p_profile_id
        AND m.tenant_id = ANY (public.current_user_tenant_ids())
    )
    OR EXISTS (   -- talent on one of my rosters
      SELECT 1
      FROM public.talent_profiles tp
      JOIN public.agency_talent_roster r ON r.talent_profile_id = tp.id
      WHERE tp.user_id = p_profile_id
        AND r.tenant_id = ANY (public.current_user_tenant_ids())
        AND r.status <> 'removed'
    )
    OR EXISTS (   -- client of one of my workspaces
      SELECT 1
      FROM public.client_profiles cp
      JOIN public.agency_client_relationships rel ON rel.client_profile_id = cp.id
      WHERE cp.user_id = p_profile_id
        AND rel.tenant_id = ANY (public.current_user_tenant_ids())
    )
    OR EXISTS (   -- client with an inquiry in one of my workspaces
      SELECT 1 FROM public.inquiries i
      WHERE i.client_user_id = p_profile_id
        AND i.tenant_id = ANY (public.current_user_tenant_ids())
    );
$$;

CREATE OR REPLACE FUNCTION public.staff_can_access_talent_profile(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_talent_roster r
      WHERE r.talent_profile_id = p_talent_profile_id
        AND r.tenant_id = ANY (public.current_user_tenant_ids())
        AND r.status <> 'removed'
    );
$$;

CREATE OR REPLACE FUNCTION public.staff_can_access_client_profile(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.client_profiles cp
      JOIN public.agency_client_relationships rel ON rel.client_profile_id = cp.id
      WHERE cp.user_id = p_user_id
        AND rel.tenant_id = ANY (public.current_user_tenant_ids())
    )
    OR EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.client_user_id = p_user_id
        AND i.tenant_id = ANY (public.current_user_tenant_ids())
    );
$$;

CREATE OR REPLACE FUNCTION public.caller_is_staff_of_any_tenant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
      OR cardinality(public.current_user_tenant_ids()) > 0;
$$;

REVOKE ALL ON FUNCTION public.staff_can_access_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_can_access_talent_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_can_access_client_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.caller_is_staff_of_any_tenant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_access_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_access_talent_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_access_client_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.caller_is_staff_of_any_tenant() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- B + C1. profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_self_or_staff ON public.profiles;
CREATE POLICY profiles_select_self_or_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (public.staff_can_access_profile(id));

DROP POLICY IF EXISTS profiles_update_self_or_staff ON public.profiles;
CREATE POLICY profiles_update_self_or_staff ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.staff_can_access_profile(id))
  WITH CHECK (public.staff_can_access_profile(id));

-- ---------------------------------------------------------------------------
-- C2. talent_profiles (talent_select_own / talent_select_public / talent_insert_self untouched)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS talent_select_staff ON public.talent_profiles;
CREATE POLICY talent_select_staff ON public.talent_profiles
  FOR SELECT TO authenticated
  USING (public.staff_can_access_talent_profile(id));

DROP POLICY IF EXISTS talent_insert_staff ON public.talent_profiles;
CREATE POLICY talent_insert_staff ON public.talent_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.caller_is_staff_of_any_tenant());

DROP POLICY IF EXISTS talent_update_own ON public.talent_profiles;
CREATE POLICY talent_update_own ON public.talent_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.staff_can_access_talent_profile(id))
  WITH CHECK (user_id = auth.uid() OR public.staff_can_access_talent_profile(id));

DROP POLICY IF EXISTS talent_delete_staff ON public.talent_profiles;
CREATE POLICY talent_delete_staff ON public.talent_profiles
  FOR DELETE TO authenticated
  USING (public.staff_can_access_talent_profile(id));

-- ---------------------------------------------------------------------------
-- C3. client_profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS client_profiles_select_own ON public.client_profiles;
CREATE POLICY client_profiles_select_own ON public.client_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.staff_can_access_client_profile(user_id));

DROP POLICY IF EXISTS client_profiles_write_own ON public.client_profiles;
CREATE POLICY client_profiles_write_own ON public.client_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.staff_can_access_client_profile(user_id))
  WITH CHECK (user_id = auth.uid() OR public.staff_can_access_client_profile(user_id));

COMMIT;
