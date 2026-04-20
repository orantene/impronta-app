-- SaaS Phase 4 / P4.4 — tenant-scoped public-read policies for CMS.
--
-- Ref: Production-hardening pass. Closes the "public-read RLS still only
--      checks status='published'" gap documented in
--      20260602100100_saas_p2_rls_tenant_scoped.sql:15.
--
-- Before this migration, public-read policies on the CMS family were:
--     cms_pages_select_published         USING (status = 'published')
--     cms_posts_select_published         USING (status = 'published')
--     cms_navigation_items_select_visible USING (visible = true)
--     cms_redirects_select_active        USING (active = true)
--
-- Correct against app-layer tenant filtering today, but a future read path
-- that forgets `.eq('tenant_id', …)` would leak cross-tenant rows. This
-- migration closes that gap by requiring the row's `tenant_id` to match
-- the request-scoped `app.current_tenant_id` GUC (wrapped by the public
-- reader RPCs defined below). Staff reads are unaffected — they pass
-- through `*_tenant_staff` policies on `is_staff_of_tenant(tenant_id)`.
--
-- Wire model:
--   1. Public reader calls a SECURITY INVOKER RPC (cms_public_pages_for_tenant,
--      cms_public_posts_for_tenant, cms_public_navigation_for_tenant,
--      cms_public_redirects_for_tenant) passing the request's tenant_id.
--   2. The RPC `PERFORM set_config('app.current_tenant_id', p_tenant_id, TRUE)`
--      in its own transaction so the GUC is visible to the SELECT that
--      immediately follows inside the function.
--   3. The SELECT hits the RLS policy below, which requires
--      `current_tenant_id() = tenant_id`. Zero rows leak to the wrong tenant
--      even if the app layer forgets its own filter.
--
-- Because SECURITY INVOKER preserves the caller's RLS context, the RPC
-- cannot be used to bypass tenant scoping — the policy still enforces it.
-- The RPC's only privilege is setting the GUC before the SELECT runs in
-- the same transaction.
--
-- Defensive: we replace rather than append the policy, so the old lenient
-- policy is gone. To_regclass guards let a partially-applied env skip
-- cleanly.

BEGIN;

-- ---------------------------------------------------------------------------
-- Public reader RPCs — pre-set GUC, return SETOF the respective table.
-- Callers chain PostgREST filters (.eq/.in/.order/.limit) on the result set.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cms_public_pages_for_tenant(
  p_tenant_id UUID
)
RETURNS SETOF public.cms_pages
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, TRUE);
  RETURN QUERY
    SELECT * FROM public.cms_pages
     WHERE tenant_id = p_tenant_id
       AND status   = 'published';
END;
$$;

COMMENT ON FUNCTION public.cms_public_pages_for_tenant(UUID) IS
  'Tenant-scoped public reader for cms_pages. Sets app.current_tenant_id so the tenant-aware SELECT policy permits rows; returns only published pages for the given tenant. Storefront code must use this instead of direct SELECT.';

CREATE OR REPLACE FUNCTION public.cms_public_posts_for_tenant(
  p_tenant_id UUID
)
RETURNS SETOF public.cms_posts
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, TRUE);
  RETURN QUERY
    SELECT * FROM public.cms_posts
     WHERE tenant_id = p_tenant_id
       AND status   = 'published';
END;
$$;

COMMENT ON FUNCTION public.cms_public_posts_for_tenant(UUID) IS
  'Tenant-scoped public reader for cms_posts. Same pattern as cms_public_pages_for_tenant.';

CREATE OR REPLACE FUNCTION public.cms_public_navigation_for_tenant(
  p_tenant_id UUID
)
RETURNS SETOF public.cms_navigation_items
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, TRUE);
  RETURN QUERY
    SELECT * FROM public.cms_navigation_items
     WHERE tenant_id = p_tenant_id
       AND visible   = TRUE;
END;
$$;

COMMENT ON FUNCTION public.cms_public_navigation_for_tenant(UUID) IS
  'Tenant-scoped public reader for cms_navigation_items. Returns only visible rows for the given tenant.';

CREATE OR REPLACE FUNCTION public.cms_public_redirects_for_tenant(
  p_tenant_id UUID
)
RETURNS SETOF public.cms_redirects
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, TRUE);
  RETURN QUERY
    SELECT * FROM public.cms_redirects
     WHERE tenant_id = p_tenant_id
       AND active    = TRUE;
END;
$$;

COMMENT ON FUNCTION public.cms_public_redirects_for_tenant(UUID) IS
  'Tenant-scoped public reader for cms_redirects. Returns only active rows for the given tenant.';

-- PostgREST needs EXECUTE for anon + authenticated to expose the RPCs.
GRANT EXECUTE ON FUNCTION public.cms_public_pages_for_tenant(UUID)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_public_posts_for_tenant(UUID)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_public_navigation_for_tenant(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_public_redirects_for_tenant(UUID)  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tenant-scoped SELECT policies — replace the lenient status/active/visible
-- policies with ones that additionally require current_tenant_id() to match.
--
-- Staff read paths are unaffected: *_tenant_staff policies remain in place
-- with is_staff_of_tenant(tenant_id).
-- ---------------------------------------------------------------------------

-- cms_pages ------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cms_pages') IS NULL THEN
    RAISE NOTICE 'cms_pages absent — skipping tenant public-read policy';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS cms_pages_select_published ON public.cms_pages;
  DROP POLICY IF EXISTS cms_pages_select_tenant_published ON public.cms_pages;

  CREATE POLICY cms_pages_select_tenant_published ON public.cms_pages
    FOR SELECT
    USING (
      status = 'published'
      AND public.current_tenant_id() IS NOT NULL
      AND tenant_id = public.current_tenant_id()
    );
END $$;

-- cms_posts ------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cms_posts') IS NULL THEN
    RAISE NOTICE 'cms_posts absent — skipping tenant public-read policy';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS cms_posts_select_published ON public.cms_posts;
  DROP POLICY IF EXISTS cms_posts_select_tenant_published ON public.cms_posts;

  CREATE POLICY cms_posts_select_tenant_published ON public.cms_posts
    FOR SELECT
    USING (
      status = 'published'
      AND public.current_tenant_id() IS NOT NULL
      AND tenant_id = public.current_tenant_id()
    );
END $$;

-- cms_navigation_items -------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cms_navigation_items') IS NULL THEN
    RAISE NOTICE 'cms_navigation_items absent — skipping tenant public-read policy';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS cms_navigation_items_select_visible ON public.cms_navigation_items;
  DROP POLICY IF EXISTS cms_navigation_items_select_tenant_visible ON public.cms_navigation_items;

  CREATE POLICY cms_navigation_items_select_tenant_visible ON public.cms_navigation_items
    FOR SELECT
    USING (
      visible = TRUE
      AND public.current_tenant_id() IS NOT NULL
      AND tenant_id = public.current_tenant_id()
    );
END $$;

-- cms_redirects --------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.cms_redirects') IS NULL THEN
    RAISE NOTICE 'cms_redirects absent — skipping tenant public-read policy';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS cms_redirects_select_active ON public.cms_redirects;
  DROP POLICY IF EXISTS cms_redirects_select_tenant_active ON public.cms_redirects;

  CREATE POLICY cms_redirects_select_tenant_active ON public.cms_redirects
    FOR SELECT
    USING (
      active = TRUE
      AND public.current_tenant_id() IS NOT NULL
      AND tenant_id = public.current_tenant_id()
    );
END $$;

COMMIT;
