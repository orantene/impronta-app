-- ===========================================================================
-- 48 Journeys program — P0-06 fixture tenant.
-- ===========================================================================
--
-- WHAT THIS IS
--   A bounded, clearly-QA tenant so the ten representative browser journeys
--   have a place to start. Follows `seed_phase5_qa.sql`. Not a migration.
--   Not Impronta. Every identifier is namespaced `qa-journeys` / `3333...`.
--
-- WHAT THIS IS NOT
--   Not the business action under test. Fixtures prepare state; Playwright
--   books, settles, and refunds through the real UI.
--   Catalog, spaces, sessions and sellable limits are added per case by
--   `web/scripts/seed-journeys-program.mjs` once credentials exist. This
--   file only creates the tenant + host so the storefront can resolve.
--
-- HOW TO RUN
--   npm --prefix web run seed:journeys-program
--
-- REMOVAL
--   DELETE FROM public.agencies WHERE id = '33333333-3333-4333-8333-333333333333';
-- ===========================================================================

BEGIN;

INSERT INTO public.agencies (
  id, slug, display_name, status, template_key, supported_locales,
  onboarding_completed_at
)
VALUES (
  '33333333-3333-4333-8333-333333333333'::UUID,
  'qa-journeys',
  'QA Journeys (48-case fixture)',
  'active',
  'default',
  ARRAY['en','es']::TEXT[],
  now()
)
ON CONFLICT (id) DO UPDATE
  SET display_name      = EXCLUDED.display_name,
      status            = EXCLUDED.status,
      supported_locales = EXCLUDED.supported_locales,
      updated_at        = now();

INSERT INTO public.agency_domains (
  id, tenant_id, hostname, kind, is_primary, status,
  verified_at, ssl_provisioned_at
)
VALUES (
  '33330005-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'qa-journeys.local',
  'subdomain',
  TRUE,
  'active',
  now(),
  NULL
)
ON CONFLICT (hostname) DO UPDATE
  SET tenant_id   = EXCLUDED.tenant_id,
      kind        = EXCLUDED.kind,
      is_primary  = EXCLUDED.is_primary,
      status      = EXCLUDED.status,
      verified_at = COALESCE(public.agency_domains.verified_at, EXCLUDED.verified_at),
      updated_at  = now();

COMMIT;
