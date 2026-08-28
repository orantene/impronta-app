-- agency_domains.tenant_slug can no longer drift from agencies.slug.
--
-- WHY THIS EXISTS
-- ───────────────
-- `tenant_slug` is a DENORMALISED copy of `agencies.slug`, read by the edge
-- host resolver (web/src/lib/saas/host-context.ts) so a request can learn its
-- tenant slug without a second round trip. The resolver does:
--
--     tenantSlug: (data.tenant_slug as string | null) ?? ""
--
-- so a NULL is not an error — it silently becomes an EMPTY SLUG, and every
-- slug-keyed surface for that host quietly dies:
--   • loadDirectoryInquiryPayload bails -> the inquiry sheet renders "closed"
--   • the guest-chat launcher renders nothing (its actions are slug-keyed)
--   • submitInquiryNowAction cannot route
-- The page still returns 200 and looks fine. There is no error anywhere.
--
-- Found live on 2026-08-27: `staging-impronta.tulala.digital` had a correct
-- tenant_id and a NULL tenant_slug, so that host had NEVER worked for tenant
-- surfaces. Nothing in the schema prevented it, and nothing in the app
-- complained. Today only one tenant has custom domains, so only one tenant
-- could hit it — the next tenant onboarded with a domain of their own can.
--
-- WHAT THIS DOES
--   1. Backfills any NULL/stale slug from the owning agency.
--   2. A trigger keeps it correct on INSERT/UPDATE of agency_domains, so a
--      caller may omit tenant_slug entirely and still get a correct row.
--   3. A trigger propagates an agencies.slug rename to every domain row.
--   4. A CHECK enforces the invariant that a tenant-owned row has a slug.
--
-- Tenant-less rows (kind 'marketing' / 'app', tenant_id IS NULL) legitimately
-- have no slug and are untouched by all four.

-- ── 1. Backfill ─────────────────────────────────────────────────────────────
UPDATE public.agency_domains d
   SET tenant_slug = a.slug
  FROM public.agencies a
 WHERE a.id = d.tenant_id
   AND d.tenant_id IS NOT NULL
   AND (d.tenant_slug IS DISTINCT FROM a.slug);

-- ── 2. Keep a domain row's slug correct ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agency_domains_sync_tenant_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    -- marketing / app hosts own no tenant and carry no slug.
    NEW.tenant_slug := NULL;
  ELSE
    SELECT a.slug INTO NEW.tenant_slug
      FROM public.agencies a
     WHERE a.id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_domains_sync_tenant_slug ON public.agency_domains;
CREATE TRIGGER trg_agency_domains_sync_tenant_slug
  BEFORE INSERT OR UPDATE OF tenant_id, tenant_slug ON public.agency_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.agency_domains_sync_tenant_slug();

-- ── 3. Propagate a slug rename to every domain of that agency ───────────────
CREATE OR REPLACE FUNCTION public.agencies_propagate_slug_to_domains()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agency_domains
     SET tenant_slug = NEW.slug
   WHERE tenant_id = NEW.id
     AND tenant_slug IS DISTINCT FROM NEW.slug;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agencies_propagate_slug_to_domains ON public.agencies;
CREATE TRIGGER trg_agencies_propagate_slug_to_domains
  AFTER UPDATE OF slug ON public.agencies
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION public.agencies_propagate_slug_to_domains();

-- ── 4. The invariant, stated ────────────────────────────────────────────────
ALTER TABLE public.agency_domains
  DROP CONSTRAINT IF EXISTS agency_domains_tenant_slug_present;
ALTER TABLE public.agency_domains
  ADD CONSTRAINT agency_domains_tenant_slug_present
  CHECK (tenant_id IS NULL OR tenant_slug IS NOT NULL)
  NOT VALID;
ALTER TABLE public.agency_domains
  VALIDATE CONSTRAINT agency_domains_tenant_slug_present;

COMMENT ON COLUMN public.agency_domains.tenant_slug IS
  'Denormalised agencies.slug for the edge host resolver. Maintained by trigger — never write it directly; set tenant_id and it fills itself. A NULL on a tenant-owned row silently degrades the host to an empty slug, which kills the inquiry sheet and guest chat with no error (see 20260828072927).';
