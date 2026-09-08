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
--   This file creates two workspaces, hosts, venue, table+room, three
--   workspace offerings, a session, and a 12-place session_tier pool.
--   Staff/customer/talent auth users are provisioned by
--   `web/scripts/seed-journeys-program.mjs` once isolated credentials exist.
--   Do not set JOURNEYS_FIXTURE_READY=1 from a seed log line alone.
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

-- Second workspace so two-tenant isolation can be proven without Impronta.
INSERT INTO public.agencies (
  id, slug, display_name, status, template_key, supported_locales,
  onboarding_completed_at, settings
)
VALUES (
  '33333333-3333-4333-8333-333333333334'::UUID,
  'qa-journeys-b',
  'QA Journeys B',
  'active',
  'default',
  ARRAY['en','es']::TEXT[],
  now(),
  jsonb_build_object('business_type_id', 'nail-salon', 'notify_sink', 'test')
)
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      settings     = EXCLUDED.settings,
      updated_at   = now();

UPDATE public.agencies
  SET settings = jsonb_build_object(
    'business_type_id', 'restaurant',
    'industry_preset', 'restaurant',
    'notify_sink', 'test'
  )
  WHERE id = '33333333-3333-4333-8333-333333333333'::UUID;

INSERT INTO public.agency_domains (
  id, tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at
)
VALUES (
  '33330005-0000-4000-8000-000000000002'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  'qa-journeys-b.local',
  'subdomain',
  TRUE,
  'active',
  now(),
  NULL
)
ON CONFLICT (hostname) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      status    = EXCLUDED.status,
      updated_at = now();

INSERT INTO public.venues (id, tenant_id, name, slug, timezone, is_default, status)
VALUES (
  '33330010-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'QA Floor',
  'qa-floor',
  'America/Mexico_City',
  TRUE,
  'active'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

INSERT INTO public.spaces (id, tenant_id, venue_id, kind, name, code, party_min, party_max, status)
VALUES
  ('33330011-0000-4000-8000-000000000001'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, '33330010-0000-4000-8000-000000000001'::UUID, 'table', 'Table 1', 'T1', 1, 4, 'active'),
  ('33330011-0000-4000-8000-000000000002'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, '33330010-0000-4000-8000-000000000001'::UUID, 'room', 'Room A', 'R1', 1, 2, 'active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

INSERT INTO public.talent_offerings (
  id, tenant_id, talent_profile_id, owner_kind, kind, title, amount_cents, currency,
  booking_mode, status, visibility, moderation_state
)
VALUES
  ('33330012-0000-4000-8000-000000000001'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, NULL, 'workspace', 'service', 'Gel manicure', 5000, 'USD', 'instant', 'published', 'public', 'approved'),
  ('33330012-0000-4000-8000-000000000002'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, NULL, 'workspace', 'product', 'House pizza', 1800, 'USD', 'instant', 'published', 'public', 'approved'),
  ('33330012-0000-4000-8000-000000000003'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, NULL, 'workspace', 'service', 'Complimentary class', 0, 'USD', 'instant', 'published', 'public', 'approved')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, amount_cents = EXCLUDED.amount_cents, updated_at = now();

INSERT INTO public.sessions (id, tenant_id, offering_id, title, starts_at, ends_at, status)
VALUES (
  '33330013-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330012-0000-4000-8000-000000000003'::UUID,
  'Morning class',
  now() + interval '1 day',
  now() + interval '1 day 1 hour',
  'scheduled'
)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = now();

INSERT INTO public.capacity_pools (
  id, tenant_id, subject_kind, subject_id, pool_key, pool_path, units_total, hold_ttl_seconds, is_active
)
VALUES (
  '33330020-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'session_tier',
  '33330013-0000-4000-8000-000000000001'::UUID,
  'default',
  ARRAY['33330020-0000-4000-8000-000000000001'::UUID],
  12,
  900,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET units_total = EXCLUDED.units_total, updated_at = now();

COMMIT;
