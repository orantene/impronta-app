-- SaaS Phase 2 / P2.1 — tenant-context helpers.
--
-- Ref: Plan §4 (Ownership), §22 (Security tests), L13, L37, L42.
--
-- These helpers are the foundation of tenant-scoped RLS. They are SECURITY
-- DEFINER + SET search_path = public so they bypass caller-side policies on
-- the lookup tables they touch (profiles, agency_memberships), and STABLE so
-- the planner can inline them inside policies.
--
-- No existing policy is touched in this migration. The next migration swaps
-- `_staff_all`-style policies on tenantised tables to use is_staff_of_tenant().

BEGIN;

-- ---------------------------------------------------------------------------
-- public.is_platform_admin() — caller is a platform super_admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND app_role = 'super_admin'
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin() IS
  'Caller is a platform super_admin. Platform admins bypass tenant scoping (Zone 1 visibility, Plan §4).';

-- ---------------------------------------------------------------------------
-- public.is_staff_of_tenant(target_tenant_id uuid)
--   Caller is staff (owner/admin/coordinator/editor/viewer) of the given
--   tenant via agency_memberships, OR is a platform super_admin.
--   Invited / expired / removed memberships do NOT grant access.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff_of_tenant(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.agency_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.tenant_id  = target_tenant_id
        AND m.status IN ('active', 'pending_acceptance')
    );
$$;

COMMENT ON FUNCTION public.is_staff_of_tenant(UUID) IS
  'Caller is staff of the given tenant (via agency_memberships) or a platform admin. Replaces is_agency_staff() in row-level policies on tenantised tables (Plan §4, L42).';

-- ---------------------------------------------------------------------------
-- public.current_user_tenant_ids() — all tenants the caller can act within.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_tenant_ids()
RETURNS UUID[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT tenant_id), ARRAY[]::UUID[])
    FROM public.agency_memberships
   WHERE profile_id = auth.uid()
     AND status IN ('active', 'pending_acceptance');
$$;

COMMENT ON FUNCTION public.current_user_tenant_ids() IS
  'Array of tenant_ids the caller is an active/pending member of. Used by admin list queries when the app does not have a specific tenant scoped.';

-- ---------------------------------------------------------------------------
-- public.current_tenant_id() — request-scoped tenant from session var.
--   Returns NULL when unset. App layer sets this for anonymous storefront
--   reads (Phase 4). Staff-authenticated reads use is_staff_of_tenant()
--   instead and do NOT require the session var.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw TEXT := current_setting('app.current_tenant_id', true);
BEGIN
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::UUID;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.current_tenant_id() IS
  'Reads the request-scoped tenant UUID from GUC app.current_tenant_id. Returns NULL when unset. Used by public storefront policies (Phase 4). Never falls back to tenant #1 (L37 — fail-hard).';

-- ---------------------------------------------------------------------------
-- public.set_tenant_context(p_tenant_id uuid)
--   Explicit setter for app.current_tenant_id. Intended for SECURITY DEFINER
--   RPCs invoked by storefront middleware (Phase 4). Checks that the caller
--   is permitted to read under that tenant's context (is_staff_of_tenant OR
--   anonymous public surface — the latter permitted only from SECURITY
--   DEFINER hostname resolution, NOT from arbitrary clients).
--
--   Phase 2 stub: sets the GUC without a permission check. Phase 4 tightens
--   once hostname resolution lands. Kept callable so migration sequencing
--   doesn't break integration tests that want to assert current_tenant_id().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, true);
END;
$$;

COMMENT ON FUNCTION public.set_tenant_context(UUID) IS
  'Sets app.current_tenant_id for the current transaction. Phase 2: no gate. Phase 4 tightens to only allow invocation from the hostname-resolution SECURITY DEFINER layer.';

-- ---------------------------------------------------------------------------
-- public.require_staff_of_tenant(target_tenant_id uuid)
--   Callable from SECURITY DEFINER RPCs to enforce tenant access. Raises
--   insufficient_privilege if the caller is not staff of target_tenant_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_staff_of_tenant(target_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT public.is_staff_of_tenant(target_tenant_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format('user is not staff of tenant %s', target_tenant_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.require_staff_of_tenant(UUID) IS
  'Assertion helper for SECURITY DEFINER RPCs. Raises 42501 insufficient_privilege if caller is not staff of the given tenant. Never logs the tenant id to the client beyond the message.';

COMMIT;
