-- Phase 4 — custom domain management: primary host switching.
--
-- Workspace owners can choose which host is canonical for the public
-- storefront. This must be atomic because agency_domains enforces exactly
-- one primary row per tenant.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_primary_agency_domain(
  p_tenant_id UUID,
  p_hostname TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID;
  v_host    TEXT;
  v_kind    TEXT;
  v_status  TEXT;
BEGIN
  v_actor := auth.uid();
  v_host := lower(trim(coalesce(p_hostname, '')));

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'set_primary_agency_domain: authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF v_host = '' THEN
    RAISE EXCEPTION 'set_primary_agency_domain: hostname is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_memberships m
    WHERE m.tenant_id = p_tenant_id
      AND m.profile_id = v_actor
      AND m.role = 'owner'
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'set_primary_agency_domain: caller is not the owner of tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  SELECT d.kind, d.status
  INTO   v_kind, v_status
  FROM   public.agency_domains d
  WHERE  d.tenant_id = p_tenant_id
    AND  d.hostname = v_host
  LIMIT 1;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'set_primary_agency_domain: hostname % is not attached to tenant %', v_host, p_tenant_id
      USING ERRCODE = '22023';
  END IF;

  IF v_kind = 'custom'
     AND v_status NOT IN ('verified', 'ssl_provisioned', 'active') THEN
    RAISE EXCEPTION 'set_primary_agency_domain: custom domain % is not ready to become primary (status=%)', v_host, v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.agency_domains
  SET    is_primary = FALSE
  WHERE  tenant_id = p_tenant_id
    AND  is_primary = TRUE;

  UPDATE public.agency_domains
  SET    is_primary = TRUE
  WHERE  tenant_id = p_tenant_id
    AND  hostname = v_host;
END;
$$;

COMMENT ON FUNCTION public.set_primary_agency_domain(UUID, TEXT) IS
  'Atomically switches the canonical public host for a tenant. Owner-only. Custom domains must already be verified before they can become primary.';

GRANT EXECUTE ON FUNCTION public.set_primary_agency_domain(UUID, TEXT) TO authenticated;

COMMIT;
