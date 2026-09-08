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
--   This file creates two workspaces, hosts, venue, table+room, catalog
--   offerings (including two therapists + a couples set), a session, and
--   a 12-place session_tier pool.
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
    'notify_sink', 'test',
    'appointments', jsonb_build_object(
      'enabled', true,
      'allowTalentDirectBooking', true,
      'terminology', 'appointments',
      'timezone', 'America/Mexico_City'
    )
  ),
  plan_tier = 'agency'
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

INSERT INTO public.talent_profiles (
  id, profile_code, display_name, created_by_agency_id,
  profile_kind, booking_terms, visibility, workflow_status, is_test_account,
  claimed_at
)
VALUES (
  '33330003-0000-4000-8000-000000000001'::UUID,
  'QA-JNY-T1',
  'QA Journeys Talent',
  '33333333-3333-4333-8333-333333333333'::UUID,
  'person',
  '{"directBookingOptIn": true}'::jsonb,
  'public',
  'published',
  TRUE,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  booking_terms = EXCLUDED.booking_terms,
  profile_kind = EXCLUDED.profile_kind,
  claimed_at = COALESCE(public.talent_profiles.claimed_at, EXCLUDED.claimed_at),
  updated_at = now();

INSERT INTO public.agency_talent_roster (
  id, tenant_id, talent_profile_id, status, agency_visibility, is_primary,
  source_type, hub_visibility_status, direct_booking_enabled
)
VALUES (
  '33330004-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330003-0000-4000-8000-000000000001'::UUID,
  'active',
  'site_visible',
  TRUE,
  'agency_created',
  'not_submitted',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  agency_visibility = EXCLUDED.agency_visibility,
  is_primary = EXCLUDED.is_primary,
  direct_booking_enabled = EXCLUDED.direct_booking_enabled,
  updated_at = now();

INSERT INTO public.talent_booking_hours (
  talent_profile_id, tenant_id, timezone, weekly, exceptions,
  slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days
)
VALUES (
  '33330003-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'America/Mexico_City',
  '{"0":[{"startMin":540,"endMin":1080}],"1":[{"startMin":540,"endMin":1080}],"2":[{"startMin":540,"endMin":1080}],"3":[{"startMin":540,"endMin":1080}],"4":[{"startMin":540,"endMin":1080}],"5":[{"startMin":540,"endMin":1080}],"6":[{"startMin":540,"endMin":1080}]}'::jsonb,
  '[]'::jsonb,
  45,
  0,
  0,
  0,
  14
)
ON CONFLICT (talent_profile_id) DO UPDATE SET
  timezone = EXCLUDED.timezone,
  weekly = EXCLUDED.weekly,
  min_notice_min = EXCLUDED.min_notice_min,
  horizon_days = EXCLUDED.horizon_days,
  slot_minutes = EXCLUDED.slot_minutes,
  updated_at = now();

INSERT INTO public.talent_profiles (
  id, profile_code, display_name, created_by_agency_id,
  profile_kind, booking_terms, visibility, workflow_status, is_test_account,
  claimed_at
)
VALUES (
  '33330003-0000-4000-8000-000000000002'::UUID,
  'QA-JNY-T2',
  'QA Journeys Therapist B',
  '33333333-3333-4333-8333-333333333333'::UUID,
  'person',
  '{"directBookingOptIn": true}'::jsonb,
  'public',
  'published',
  TRUE,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  booking_terms = EXCLUDED.booking_terms,
  profile_kind = EXCLUDED.profile_kind,
  claimed_at = COALESCE(public.talent_profiles.claimed_at, EXCLUDED.claimed_at),
  updated_at = now();

INSERT INTO public.agency_talent_roster (
  id, tenant_id, talent_profile_id, status, agency_visibility, is_primary,
  source_type, hub_visibility_status, direct_booking_enabled
)
VALUES (
  '33330004-0000-4000-8000-000000000002'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330003-0000-4000-8000-000000000002'::UUID,
  'active',
  'site_visible',
  FALSE,
  'agency_created',
  'not_submitted',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  agency_visibility = EXCLUDED.agency_visibility,
  direct_booking_enabled = EXCLUDED.direct_booking_enabled,
  updated_at = now();

INSERT INTO public.talent_booking_hours (
  talent_profile_id, tenant_id, timezone, weekly, exceptions,
  slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days
)
VALUES (
  '33330003-0000-4000-8000-000000000002'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'America/Mexico_City',
  '{"0":[{"startMin":540,"endMin":1080}],"1":[{"startMin":540,"endMin":1080}],"2":[{"startMin":540,"endMin":1080}],"3":[{"startMin":540,"endMin":1080}],"4":[{"startMin":540,"endMin":1080}],"5":[{"startMin":540,"endMin":1080}],"6":[{"startMin":540,"endMin":1080}]}'::jsonb,
  '[]'::jsonb,
  45,
  0,
  0,
  0,
  14
)
ON CONFLICT (talent_profile_id) DO UPDATE SET
  timezone = EXCLUDED.timezone,
  weekly = EXCLUDED.weekly,
  min_notice_min = EXCLUDED.min_notice_min,
  horizon_days = EXCLUDED.horizon_days,
  slot_minutes = EXCLUDED.slot_minutes,
  updated_at = now();

INSERT INTO public.talent_offerings (
  id, tenant_id, talent_profile_id, owner_kind, kind, title, amount_cents, currency,
  booking_mode, allow_pay_in_person, reserve_mode, deposit_pct, duration_minutes,
  status, visibility, moderation_state, sort_order
)
VALUES
  (
    '33330012-0000-4000-8000-000000000001'::UUID,
    '33333333-3333-4333-8333-333333333333'::UUID,
    '33330003-0000-4000-8000-000000000001'::UUID,
    'talent', 'service', 'Gel manicure', 5000, 'USD',
    'instant', TRUE, 'deposit', 50, 45,
    'published', 'public', 'approved', 10
  ),
  ('33330012-0000-4000-8000-000000000002'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, NULL, 'workspace', 'product', 'House pizza', 1800, 'USD', 'instant', TRUE, 'full', NULL, NULL, 'published', 'public', 'approved', 0),
  ('33330012-0000-4000-8000-000000000003'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, NULL, 'workspace', 'service', 'Complimentary class', 0, 'USD', 'instant', TRUE, 'full', NULL, NULL, 'published', 'public', 'approved', 0)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  amount_cents = EXCLUDED.amount_cents,
  allow_pay_in_person = EXCLUDED.allow_pay_in_person,
  owner_kind = EXCLUDED.owner_kind,
  talent_profile_id = EXCLUDED.talent_profile_id,
  reserve_mode = EXCLUDED.reserve_mode,
  deposit_pct = EXCLUDED.deposit_pct,
  duration_minutes = EXCLUDED.duration_minutes,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.sessions (id, tenant_id, offering_id, venue_id, title, starts_at, ends_at, status)
VALUES (
  '33330013-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330012-0000-4000-8000-000000000003'::UUID,
  '33330010-0000-4000-8000-000000000001'::UUID,
  'Morning class',
  now() + interval '1 day',
  now() + interval '1 day 1 hour',
  'scheduled'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  venue_id = EXCLUDED.venue_id,
  updated_at = now();

INSERT INTO public.talent_offerings (
  id, tenant_id, talent_profile_id, owner_kind, kind, title, amount_cents, currency,
  booking_mode, allow_pay_in_person, reserve_mode, status, visibility, moderation_state
)
VALUES (
  '33330012-0000-4000-8000-000000000004'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  NULL, 'workspace', 'service', 'Table reservation', 0, 'USD',
  'instant', TRUE, 'free', 'published', 'unlisted', 'approved'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  reserve_mode = EXCLUDED.reserve_mode,
  allow_pay_in_person = EXCLUDED.allow_pay_in_person,
  updated_at = now();

INSERT INTO public.space_groups (
  id, tenant_id, venue_id, name, kind, party_min, party_max, sell_mode
)
VALUES (
  '33330014-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330010-0000-4000-8000-000000000001'::UUID,
  'Two-to-four tops',
  'party_band',
  1,
  4,
  'band'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

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

INSERT INTO public.capacity_pools (
  id, tenant_id, subject_kind, subject_id, pool_key, pool_path, units_total, hold_ttl_seconds, is_active
)
VALUES (
  '33330020-0000-4000-8000-000000000002'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'space_group',
  '33330014-0000-4000-8000-000000000001'::UUID,
  'default',
  ARRAY['33330020-0000-4000-8000-000000000002'::UUID],
  4,
  900,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET units_total = EXCLUDED.units_total, updated_at = now();

INSERT INTO public.talent_offerings (
  id, tenant_id, talent_profile_id, owner_kind, kind, title, amount_cents, currency,
  booking_mode, allow_pay_in_person, reserve_mode, duration_minutes,
  status, visibility, moderation_state, attributes, sort_order
)
VALUES
  (
    '33330012-0000-4000-8000-000000000005'::UUID,
    '33333333-3333-4333-8333-333333333333'::UUID,
    '33330003-0000-4000-8000-000000000002'::UUID,
    'talent', 'service', 'Massage', 0, 'USD',
    'instant', TRUE, 'free', 45,
    'published', 'public', 'approved',
    '{}'::jsonb,
    20
  ),
  (
    '33330012-0000-4000-8000-000000000006'::UUID,
    '33333333-3333-4333-8333-333333333333'::UUID,
    '33330003-0000-4000-8000-000000000001'::UUID,
    'talent', 'service', 'Couples massage', 0, 'USD',
    'instant', TRUE, 'free', 45,
    'published', 'public', 'approved',
    '{"resourceSet":{"companionTalentIds":["33330003-0000-4000-8000-000000000002"],"spaceId":"33330011-0000-4000-8000-000000000002"}}'::jsonb,
    30
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  amount_cents = EXCLUDED.amount_cents,
  allow_pay_in_person = EXCLUDED.allow_pay_in_person,
  owner_kind = EXCLUDED.owner_kind,
  talent_profile_id = EXCLUDED.talent_profile_id,
  reserve_mode = EXCLUDED.reserve_mode,
  duration_minutes = EXCLUDED.duration_minutes,
  attributes = EXCLUDED.attributes,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.capacity_pools (
  id, tenant_id, subject_kind, subject_id, pool_key, pool_path, units_total, hold_ttl_seconds, is_active
)
VALUES (
  '33330020-0000-4000-8000-000000000003'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'space',
  '33330011-0000-4000-8000-000000000002'::UUID,
  'default',
  ARRAY['33330020-0000-4000-8000-000000000003'::UUID],
  1,
  900,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET units_total = EXCLUDED.units_total, updated_at = now();

INSERT INTO public.venue_service_windows (
  id, tenant_id, venue_id, key, label, local_time, duration_minutes, weekdays,
  seating_step_minutes, last_seating_offset_min, is_active, starts_on
)
VALUES (
  '33330015-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330010-0000-4000-8000-000000000001'::UUID,
  'dinner',
  '{"en":"Dinner","es":"Cena"}'::jsonb,
  TIME '12:00',
  600,
  ARRAY[1,2,3,4,5,6,7],
  30,
  90,
  TRUE,
  CURRENT_DATE - 1
)
ON CONFLICT (id) DO UPDATE SET is_active = TRUE, updated_at = now();

INSERT INTO public.venue_service_rules (
  venue_id, tenant_id, is_active, party_size_min, party_size_max,
  horizon_days, min_notice_minutes, default_turn_minutes,
  reservation_offering_id, notes_enabled, walkins_enabled
)
VALUES (
  '33330010-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  TRUE,
  1,
  4,
  14,
  0,
  90,
  '33330012-0000-4000-8000-000000000004'::UUID,
  TRUE,
  TRUE
)
ON CONFLICT (venue_id) DO UPDATE SET
  is_active = TRUE,
  min_notice_minutes = 0,
  reservation_offering_id = EXCLUDED.reservation_offering_id,
  updated_at = now();

COMMIT;
