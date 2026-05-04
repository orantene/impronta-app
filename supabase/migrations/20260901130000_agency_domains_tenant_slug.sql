-- Phase 4 — Custom domain support: denormalize tenant_slug onto agency_domains.
--
-- Problem: the edge middleware resolves hostname → tenantId via agency_domains
-- (anon-key readable), but the agencies table is staff-only via RLS, so the
-- middleware can't join agencies to get the slug without a service-role key.
--
-- Solution: store tenant_slug as a denormalized TEXT column on agency_domains.
-- This is the authoritative slug used by the middleware to emit the
-- x-impronta-tenant-slug header, which downstream layouts use for the branded
-- subdomain → canonical /<slug>/admin redirect (Phase 3.12/3.13) and for
-- custom domain routing (Phase 4).
--
-- Maintenance contract: always include tenant_slug in INSERT/UPDATE statements
-- for agency_domains when a tenant_id is present. A trigger enforces this.

ALTER TABLE public.agency_domains
  ADD COLUMN IF NOT EXISTS tenant_slug TEXT;

COMMENT ON COLUMN public.agency_domains.tenant_slug IS
  'Denormalized copy of agencies.slug for edge-middleware lookups (anon key cannot join agencies via RLS). Must be set on INSERT/UPDATE whenever tenant_id is non-null.';

-- Backfill existing rows from agencies.
UPDATE public.agency_domains d
SET    tenant_slug = a.slug
FROM   public.agencies a
WHERE  d.tenant_id = a.id
  AND  d.tenant_id IS NOT NULL
  AND  d.tenant_slug IS NULL;

-- Trigger: keep tenant_slug in sync when agencies.slug changes.
CREATE OR REPLACE FUNCTION public.sync_agency_domain_slug()
  RETURNS TRIGGER LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.agency_domains
  SET    tenant_slug = NEW.slug
  WHERE  tenant_id = NEW.id
    AND  tenant_slug IS DISTINCT FROM NEW.slug;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agency_domain_slug ON public.agencies;
CREATE TRIGGER trg_sync_agency_domain_slug
  AFTER UPDATE OF slug ON public.agencies
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION public.sync_agency_domain_slug();
