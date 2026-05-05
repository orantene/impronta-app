-- M4 fix: filter resolve_public_tenant_by_slug to kind='agency' only.
-- Without this filter, the function could resolve talent/individual rows
-- registered in the agencies table under a non-agency kind, which should
-- not be routable as a public storefront tenant.

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
    AND a.kind = 'agency'
    AND a.status NOT IN ('cancelled', 'archived')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_public_tenant_by_slug(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.resolve_public_tenant_by_slug(TEXT) IS
  'Public slug to tenant resolver for path-based storefront routing. Exposes only tenant id + slug for active agencies (kind=agency, not cancelled/archived).';

COMMIT;
