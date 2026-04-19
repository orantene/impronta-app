-- SaaS Phase 4 / P4.2 — Unified domain registry.
--
-- Extends public.agency_domains to be THE single source of truth for
-- hostname → (context, tenant) mapping. Previously the edge middleware
-- mixed hardcoded root domains (hostname.ts DEFAULT_ROOT_DOMAINS) with a
-- DB lookup; now every hostname lives in this table and the resolver is
-- a single query. Domains are swappable via DB + env only — no code
-- deploy needed to add/rotate one.
--
-- New `kind` values encode route context:
--   'marketing'    → public SaaS marketing site (no tenant)
--   'app'          → internal admin / coordination app (no tenant)
--   'hub'          → global hub, cross-tenant discovery (no tenant)
--   'subdomain'    → tenant subdomain (tenant-scoped, existing)
--   'custom'       → tenant custom domain (tenant-scoped, existing)
--
-- Tenant-id scope rule (enforced at DB level):
--   subdomain/custom   → tenant_id REQUIRED
--   marketing/app/hub  → tenant_id MUST be NULL (platform-level)

BEGIN;

-- Relax tenant_id so platform contexts can have NULL.
ALTER TABLE public.agency_domains
  ALTER COLUMN tenant_id DROP NOT NULL;

-- Extend the kind check.
ALTER TABLE public.agency_domains
  DROP CONSTRAINT IF EXISTS agency_domains_kind_check;

ALTER TABLE public.agency_domains
  ADD CONSTRAINT agency_domains_kind_check
  CHECK (kind IN ('subdomain','custom','marketing','app','hub'));

-- Cross-column constraint keeps platform vs tenant rows honest.
ALTER TABLE public.agency_domains
  DROP CONSTRAINT IF EXISTS agency_domains_tenant_scope_check;

ALTER TABLE public.agency_domains
  ADD CONSTRAINT agency_domains_tenant_scope_check
  CHECK (
    (kind IN ('subdomain','custom') AND tenant_id IS NOT NULL)
    OR (kind IN ('marketing','app','hub') AND tenant_id IS NULL)
  );

-- The subdomain-delete guard already bails on NULL tenant_id (EXISTS check on
-- agencies returns false), so no trigger change is needed.

-- ---------------------------------------------------------------------------
-- Phase 4 locked seed (domains in docs are authoritative — no code hardcoding).
-- ---------------------------------------------------------------------------

-- Demote legacy tenant #1 subdomain so the agency's real custom domain can
-- claim primary. The row itself stays (subdomain rows are non-deletable by
-- design) so reverse migrations still have a target.
UPDATE public.agency_domains
   SET is_primary = FALSE,
       updated_at = now()
 WHERE hostname = 'impronta.studiobooking.io';

INSERT INTO public.agency_domains
  (tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at)
VALUES
  -- Agency #1 production (primary)
  ('00000000-0000-0000-0000-000000000001'::UUID, 'improntamodels.com', 'custom', TRUE,  'active', now(), now()),
  -- Platform-level production contexts
  (NULL, 'pdcvacations.com',        'marketing', FALSE, 'active', now(), now()),
  (NULL, 'app.pdcvacations.com',    'app',       FALSE, 'active', now(), now()),
  (NULL, 'pitiriasisversicolor.com','hub',       FALSE, 'active', now(), now()),
  -- Local-dev mirrors: same resolver path as production; just different hostnames.
  -- /etc/hosts on the developer's machine points these to 127.0.0.1.
  ('00000000-0000-0000-0000-000000000001'::UUID, 'impronta.local', 'custom', FALSE, 'active', now(), NULL),
  (NULL, 'marketing.local',         'marketing', FALSE, 'active', now(), NULL),
  (NULL, 'app.local',               'app',       FALSE, 'active', now(), NULL),
  (NULL, 'hub.local',               'hub',       FALSE, 'active', now(), NULL)
ON CONFLICT (hostname) DO UPDATE
  SET kind = EXCLUDED.kind,
      tenant_id = EXCLUDED.tenant_id,
      is_primary = EXCLUDED.is_primary,
      status = EXCLUDED.status,
      verified_at = COALESCE(public.agency_domains.verified_at, EXCLUDED.verified_at),
      ssl_provisioned_at = COALESCE(public.agency_domains.ssl_provisioned_at, EXCLUDED.ssl_provisioned_at),
      updated_at = now();

COMMIT;
