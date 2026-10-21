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
--   * NOT allowed (fail closed, checked first): the Tulala hub workspace (agencies.kind = 'hub'),
--     the talent's HOME workspace (talent_profiles.created_by_agency_id = the tenant) and a
--     roster row marked is_primary. Answers 'not_allowed_hub' / 'not_allowed_home' /
--     'not_allowed_primary'; nothing is changed.
--   * Idempotent cleanup: if the workspace ALREADY removed her (status 'removed'), the call still
--     hides her listings, revokes her terms and ends exclusivity.
-- Returns 'left' when the row transitioned OR any listing/terms/exclusivity row was cleaned, else
-- 'not_member' (no row ever, nothing to clean). A second call is therefore 'not_member'. Tables of other held migrations (listings #4159, terms #4158) are used only
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
  v_status text;
  v_is_primary boolean;
  v_kind text;
  v_changed boolean := false;
  v_n integer;
BEGIN
  IF p_tenant_id IS NULL OR p_talent_profile_id IS NULL
     OR NOT public.is_own_talent_profile(p_talent_profile_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT a.kind INTO v_kind FROM public.agencies a WHERE a.id = p_tenant_id;
  IF v_kind = 'hub' THEN
    RETURN 'not_allowed_hub';
  END IF;
  IF EXISTS (SELECT 1 FROM public.talent_profiles tp
              WHERE tp.id = p_talent_profile_id AND tp.created_by_agency_id = p_tenant_id) THEN
    RETURN 'not_allowed_home';
  END IF;

  SELECT id, status, COALESCE(is_primary, false) INTO v_roster_id, v_status, v_is_primary
    FROM public.agency_talent_roster
   WHERE tenant_id = p_tenant_id
     AND talent_profile_id = p_talent_profile_id
   ORDER BY (status = 'removed'), updated_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_roster_id IS NOT NULL AND v_status IN ('pending', 'active', 'inactive', 'archived_for_downgrade') THEN
    IF v_is_primary THEN
      RETURN 'not_allowed_primary';
    END IF;
    UPDATE public.agency_talent_roster
       SET status = 'removed',
           removed_at = now(),
           removed_by = (SELECT auth.uid()),
           archived_for_downgrade_at = NULL,
           archived_for_downgrade_by = NULL,
           archived_for_downgrade_event = NULL,
           updated_at = now()
     WHERE id = v_roster_id;
    v_changed := true;
  END IF;

  -- Cleanup below runs even when the workspace had already removed her (idempotent).
  IF to_regclass('public.workspace_service_listings') IS NOT NULL THEN
    EXECUTE 'UPDATE public.workspace_service_listings SET status = ''hidden''
              WHERE tenant_id = $1 AND talent_profile_id = $2 AND status <> ''hidden'''
      USING p_tenant_id, p_talent_profile_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_changed := true; END IF;
  END IF;

  IF to_regclass('public.workspace_talent_terms') IS NOT NULL THEN
    EXECUTE 'UPDATE public.workspace_talent_terms
                SET status = ''revoked'', responded_by = (SELECT auth.uid()), responded_at = now()
              WHERE tenant_id = $1 AND talent_profile_id = $2 AND status IN (''accepted'', ''pending'')'
      USING p_tenant_id, p_talent_profile_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_changed := true; END IF;
  END IF;

  IF to_regclass('public.talent_exclusive_workspace') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.talent_exclusive_workspace WHERE talent_profile_id = $1 AND tenant_id = $2'
      USING p_talent_profile_id, p_tenant_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN v_changed := true; END IF;
  END IF;

  RETURN CASE WHEN v_changed THEN 'left' ELSE 'not_member' END;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_workspace_as_talent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_workspace_as_talent(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.leave_workspace_as_talent(uuid, uuid) IS
  'TUL-1469: the talent leaves one workspace. Roster removed, listings hidden, terms revoked, exclusivity ended; jobs already booked are not touched.';

COMMIT;
