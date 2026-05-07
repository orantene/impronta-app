-- Ensure Impronta keeps a canonical www custom-domain alias row.
-- This supports host-context canonical redirect behavior:
--   www.improntamodels.com -> improntamodels.com (primary custom host)

INSERT INTO public.agency_domains (
  tenant_id,
  tenant_slug,
  hostname,
  kind,
  is_primary,
  status,
  verification_token,
  verified_at,
  failure_reason,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'impronta',
  'www.improntamodels.com',
  'custom',
  FALSE,
  'active',
  NULL,
  NOW(),
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (hostname) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  tenant_slug = EXCLUDED.tenant_slug,
  kind = 'custom',
  is_primary = FALSE,
  status = CASE
    WHEN public.agency_domains.status IN ('active', 'verified', 'ssl_provisioned')
      THEN public.agency_domains.status
    ELSE 'active'
  END,
  verified_at = COALESCE(public.agency_domains.verified_at, EXCLUDED.verified_at),
  failure_reason = NULL,
  updated_at = NOW()
WHERE public.agency_domains.tenant_id = EXCLUDED.tenant_id;
