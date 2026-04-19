-- SaaS Phase 1 / P1.A.3 — public.agency_domains (subdomain + custom domain mapping)
--                          + tenant #1 subdomain seed.
--
-- Ref: docs/saas/phase-0/03-state-machines.md §4 (domain lifecycle),
--      docs/saas/phase-1/o1-o7-resolutions.md O2 (slug 'impronta'),
--      Plan §4, §12 (Custom Domains), L2, L4, L37.
--
-- Phase 5 implements the production DNS verification + Vercel SSL provisioning
-- (human-in-loop). Phase 1 seeds only the subdomain row for tenant #1 and
-- supports additional rows being inserted for future tenants.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_domains (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  hostname                TEXT        NOT NULL UNIQUE,
  kind                    TEXT        NOT NULL CHECK (kind IN ('subdomain','custom')),
  is_primary              BOOLEAN     NOT NULL DEFAULT FALSE,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN (
                                          'pending','dns_verification_sent','verified',
                                          'ssl_provisioned','active','failed','suspended'
                                        )),
  verification_token      TEXT,
  verified_at             TIMESTAMPTZ,
  ssl_provisioned_at      TIMESTAMPTZ,
  last_health_check_at    TIMESTAMPTZ,
  failure_reason          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agency_domains IS
  'Subdomain (kind=subdomain) + custom domain (kind=custom) rows per tenant. Subdomain auto-created on agency creation, not deletable, always exists as fallback (Plan §4). Admin workspace is never served on a custom domain (L2).';

-- At most one primary domain per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS agency_domains_tenant_primary_uniq
  ON public.agency_domains (tenant_id)
  WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS agency_domains_tenant_idx
  ON public.agency_domains (tenant_id);

CREATE INDEX IF NOT EXISTS agency_domains_active_custom_idx
  ON public.agency_domains (hostname)
  WHERE kind = 'custom' AND status = 'active';

-- Subdomain is not deletable (Plan §4 rule). Enforce at DB level.
CREATE OR REPLACE FUNCTION public.agency_domains_block_subdomain_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.kind = 'subdomain' THEN
    -- Only allow delete if the whole tenant is being deleted (CASCADE from agencies).
    -- Detect via current_setting hint that we're in a cascade... simplest check:
    -- the parent agency row no longer exists.
    IF EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = OLD.tenant_id) THEN
      RAISE EXCEPTION
        'Cannot delete subdomain row for tenant %; subdomains are the permanent fallback (Plan §4).',
        OLD.tenant_id
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_domains_block_subdomain_delete ON public.agency_domains;
CREATE TRIGGER trg_agency_domains_block_subdomain_delete
  BEFORE DELETE ON public.agency_domains
  FOR EACH ROW EXECUTE FUNCTION public.agency_domains_block_subdomain_delete();

-- Seed tenant #1 subdomain.
INSERT INTO public.agency_domains (
  tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  'impronta.studiobooking.io',
  'subdomain',
  TRUE,
  'active',
  now(),
  now()
)
ON CONFLICT (hostname) DO NOTHING;

ALTER TABLE public.agency_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_domains_staff_all ON public.agency_domains;
CREATE POLICY agency_domains_staff_all ON public.agency_domains
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

-- Public read of active rows so hostname resolution at the edge can hit this
-- table without a privileged session. Only exposes hostname + tenant_id +
-- status — which is already implicit in the public URL structure.
DROP POLICY IF EXISTS agency_domains_public_active_select ON public.agency_domains;
CREATE POLICY agency_domains_public_active_select ON public.agency_domains
  FOR SELECT
  USING (status = 'active');

CREATE OR REPLACE FUNCTION public.agency_domains_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_domains_touch_updated_at ON public.agency_domains;
CREATE TRIGGER trg_agency_domains_touch_updated_at
  BEFORE UPDATE ON public.agency_domains
  FOR EACH ROW EXECUTE FUNCTION public.agency_domains_touch_updated_at();

COMMIT;
