-- Phase 3.15 — path-based public workspace tenant resolver.
--
-- Middleware needs to resolve tulala.digital/<tenantSlug>/... without using
-- the service role at the edge. agencies remains staff-only via RLS, so expose
-- the tiny public mapping needed for storefront dispatch through a
-- SECURITY DEFINER function.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_public_tenant_by_slug(p_slug TEXT)
RETURNS TABLE (
  tenant_id UUID,
  tenant_slug TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT a.id, a.slug
  FROM public.agencies a
  WHERE a.slug = lower(trim(p_slug))
    AND a.status NOT IN ('cancelled', 'archived')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_public_tenant_by_slug(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.resolve_public_tenant_by_slug(TEXT) IS
  'Public slug to tenant resolver for path-based storefront routing. Exposes only tenant id + slug for non-cancelled, non-archived agencies.';

COMMIT;
