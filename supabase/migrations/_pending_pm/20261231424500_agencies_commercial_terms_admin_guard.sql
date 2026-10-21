-- TUL-1311 — HELD (PM applies). Do not db push / apply by hand.
--
-- agencies.settings -> 'commercialTerms' (default deposit %, refund policy,
-- instant book) is money configuration. The agencies UPDATE policy admits
-- editors, so any workspace editor could PATCH it through PostgREST even though
-- the app action requires manage_agency_settings. Guard the key in the database.
--
-- Admitted to CHANGE the key:
--   * service_role / internal direct connection (jwt role unset) — same caller
--     identification idiom as engine_caller_may_write_tenant_finances
--     (20261226000011): both request.jwt.claims->>'role' and
--     request.jwt.claim.role are read; '' means a direct connection.
--   * platform admin (public.is_platform_admin(), trusted in sibling policies)
--   * an ACTIVE owner/admin member of the agency (inline check; deliberately
--     not is_staff_of_tenant, which admits every role, and not is_tenant_admin,
--     which lives in another held migration).
-- Everyone else gets 42501 only if they actually change that key; updates to
-- any other settings key, or to other columns, are untouched.

CREATE OR REPLACE FUNCTION public.agencies_guard_commercial_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  IF NEW.settings -> 'commercialTerms' IS DISTINCT FROM OLD.settings -> 'commercialTerms' THEN
    v_caller_role := COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      ''
    );

    IF v_caller_role IN ('service_role', '')
       OR public.is_platform_admin()
       OR EXISTS (
         SELECT 1
         FROM public.agency_memberships m
         WHERE m.profile_id = auth.uid()
           AND m.tenant_id  = NEW.id
           AND m.status     = 'active'
           AND m.role IN ('owner', 'admin')
       )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Only a workspace owner or admin can change commercial terms.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.agencies_guard_commercial_terms() IS
  'TUL-1311: BEFORE UPDATE guard on agencies.settings->commercialTerms. Allows service_role, platform admins and active owner/admin members only.';

REVOKE ALL ON FUNCTION public.agencies_guard_commercial_terms() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.agencies_guard_commercial_terms() FROM anon;

DROP TRIGGER IF EXISTS agencies_guard_commercial_terms ON public.agencies;
CREATE TRIGGER agencies_guard_commercial_terms
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.agencies_guard_commercial_terms();
