-- TUL-1469 · A talent leaves a workspace (Where you appear -> Leave).
--
-- HELD in _pending_pm. Additive and idempotent: one new function, nothing existing changes.
-- The app answers "unavailable" while it is absent.
--
-- leave_workspace_as_talent(p_tenant_id, p_talent_profile_id) returns text:
--   * the caller must own the talent profile (is_own_talent_profile), else 42501;
--   * the roster row for that workspace goes to status 'removed' (removed_at / removed_by);
--   * the talent's listings in THAT workspace are hidden (nothing new sells through it);
--   * accepted terms with that workspace are revoked and its exclusivity ends;
--   * jobs and bookings ALREADY made are not touched: open jobs stay.
-- Returns 'left', or 'not_member' when there is no live roster row (idempotent: a second call
-- is 'not_member'). Tables of other held migrations (listings #4159, terms #4158) are used only
-- when they exist, so this applies in any order.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.leave_workspace_as_talent(uuid, uuid);

BEGIN;

CREATE OR REPLACE FUNCTION public.leave_workspace_as_talent(p_tenant_id uuid, p_talent_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roster_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_talent_profile_id IS NULL
     OR NOT public.is_own_talent_profile(p_talent_profile_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_roster_id
    FROM public.agency_talent_roster
   WHERE tenant_id = p_tenant_id
     AND talent_profile_id = p_talent_profile_id
     AND status IN ('pending', 'active', 'inactive')
   FOR UPDATE;
  IF v_roster_id IS NULL THEN
    RETURN 'not_member';
  END IF;

  UPDATE public.agency_talent_roster
     SET status = 'removed',
         removed_at = now(),
         removed_by = (SELECT auth.uid()),
         updated_at = now()
   WHERE id = v_roster_id;

  IF to_regclass('public.workspace_service_listings') IS NOT NULL THEN
    EXECUTE 'UPDATE public.workspace_service_listings SET status = ''hidden''
              WHERE tenant_id = $1 AND talent_profile_id = $2 AND status <> ''hidden'''
      USING p_tenant_id, p_talent_profile_id;
  END IF;

  IF to_regclass('public.workspace_talent_terms') IS NOT NULL THEN
    EXECUTE 'UPDATE public.workspace_talent_terms
                SET status = ''revoked'', responded_by = (SELECT auth.uid()), responded_at = now()
              WHERE tenant_id = $1 AND talent_profile_id = $2 AND status IN (''accepted'', ''pending'')'
      USING p_tenant_id, p_talent_profile_id;
  END IF;

  IF to_regclass('public.talent_exclusive_workspace') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.talent_exclusive_workspace WHERE talent_profile_id = $1 AND tenant_id = $2'
      USING p_talent_profile_id, p_tenant_id;
  END IF;

  RETURN 'left';
END;
$$;

REVOKE ALL ON FUNCTION public.leave_workspace_as_talent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_workspace_as_talent(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.leave_workspace_as_talent(uuid, uuid) IS
  'TUL-1469: the talent leaves one workspace. Roster removed, listings hidden, terms revoked, exclusivity ended; jobs already booked are not touched.';

COMMIT;
