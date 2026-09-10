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
--   offerings (including two therapists + a couples set), a class session,
--   a 12-place session_tier pool, and a published $0 event night
--   (`/events/qa-night`) with a General admission tier + session_tier pool.
--   Workspace B transacts too — venue, station, technician with booking
--   hours, two offerings, a one-unit pool, a customer and a paid order — see
--   the section at the foot of this file for why an EMPTY second workspace
--   made the isolation cases pass without proving anything.
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

-- THE FIXTURE DOES NOT FIGHT OVER WHICH HOST IS PRIMARY. A real staging host
-- (`staging-qa-journeys.tulala.digital`) was later made primary for this
-- workspace and this `.local` row demoted, which is correct: a QA host you can
-- actually open beats a hostname that resolves nowhere. Re-asserting
-- `is_primary = TRUE` here made the whole seed abort on
-- `agency_domains_tenant_primary_uniq`, and because the file is one
-- transaction NOTHING in it applied -- the seed was no longer re-runnable at
-- all. So: claim primary only when the workspace has no primary yet, and never
-- take it away from a row that already holds it.
INSERT INTO public.agency_domains (
  id, tenant_id, hostname, kind, is_primary, status,
  verified_at, ssl_provisioned_at
)
SELECT
  '33330005-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'qa-journeys.local',
  'subdomain',
  NOT EXISTS (
    SELECT 1 FROM public.agency_domains d
     WHERE d.tenant_id = '33333333-3333-4333-8333-333333333333'::UUID
       AND d.is_primary
  ),
  'active',
  now(),
  NULL
ON CONFLICT (hostname) DO UPDATE
  SET tenant_id   = EXCLUDED.tenant_id,
      kind        = EXCLUDED.kind,
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

-- Same rule as workspace A's host above.
INSERT INTO public.agency_domains (
  id, tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at
)
SELECT
  '33330005-0000-4000-8000-000000000002'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  'qa-journeys-b.local',
  'subdomain',
  NOT EXISTS (
    SELECT 1 FROM public.agency_domains d
     WHERE d.tenant_id = '33333333-3333-4333-8333-333333333334'::UUID
       AND d.is_primary
  ),
  'active',
  now(),
  NULL
ON CONFLICT (hostname) DO UPDATE
  SET tenant_id = EXCLUDED.tenant_id,
      status    = EXCLUDED.status,
      updated_at = now();

-- Public identity. Branded 404 / launcher / admin chrome read public_name, not
-- agencies.display_name. Without a row the storefront falls back to "Studio" /
-- "the agency" and workspace-identity assertions scrape CSS instead of a name.
INSERT INTO public.agency_business_identity (
  tenant_id, public_name, legal_name, tagline,
  contact_email, default_locale, supported_locales, version
)
VALUES
  (
    '33333333-3333-4333-8333-333333333333'::UUID,
    'QA Journeys',
    'QA Journeys (48-case fixture)',
    'Isolated 48 Journeys fixture — not a live tenant.',
    'qa-journeys-owner@impronta.test',
    'en',
    ARRAY['en','es']::TEXT[],
    1
  ),
  (
    '33333333-3333-4333-8333-333333333334'::UUID,
    'QA Journeys B',
    'QA Journeys B (48-case fixture)',
    'Isolated second workspace — authorization positive control.',
    'qa-journeys-b-owner@impronta.test',
    'en',
    ARRAY['en','es']::TEXT[],
    1
  )
ON CONFLICT (tenant_id) DO UPDATE
  SET public_name         = EXCLUDED.public_name,
      legal_name          = EXCLUDED.legal_name,
      tagline             = EXCLUDED.tagline,
      contact_email       = EXCLUDED.contact_email,
      default_locale      = EXCLUDED.default_locale,
      supported_locales   = EXCLUDED.supported_locales,
      updated_at          = now();

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

INSERT INTO public.sessions (id, tenant_id, offering_id, venue_id, title, starts_at, ends_at, status)
VALUES (
  '33330013-0000-4000-8000-000000000003'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330012-0000-4000-8000-000000000003'::UUID,
  '33330010-0000-4000-8000-000000000001'::UUID,
  'Last place class',
  now() + interval '1 day 4 hours',
  now() + interval '1 day 5 hours',
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
  '33330020-0000-4000-8000-000000000006'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'session_tier',
  '33330013-0000-4000-8000-000000000003'::UUID,
  'default',
  ARRAY['33330020-0000-4000-8000-000000000006'::UUID],
  1,
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

-- C12 — published $0 night. Public surface is /events/qa-night, not a
-- hardcoded event id in a page design.
INSERT INTO public.talent_offerings (
  id, tenant_id, talent_profile_id, owner_kind, kind, title, amount_cents, currency,
  booking_mode, allow_pay_in_person, reserve_mode, status, visibility, moderation_state, sort_order
)
VALUES (
  '33330012-0000-4000-8000-000000000007'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  NULL, 'workspace', 'service', 'QA Night ticket', 0, 'USD',
  'instant', TRUE, 'free', 'published', 'public', 'approved', 40
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  amount_cents = EXCLUDED.amount_cents,
  allow_pay_in_person = EXCLUDED.allow_pay_in_person,
  reserve_mode = EXCLUDED.reserve_mode,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.talent_offering_variants (
  id, offering_id, label, amount_cents, sort_order, pool_key, admits_per_unit, min_per_order, is_hidden
)
VALUES (
  '33330021-0000-4000-8000-000000000001'::UUID,
  '33330012-0000-4000-8000-000000000007'::UUID,
  'General admission', 0, 10, 'ga', 1, 1, FALSE
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  amount_cents = EXCLUDED.amount_cents,
  pool_key = EXCLUDED.pool_key,
  admits_per_unit = EXCLUDED.admits_per_unit,
  updated_at = now();

-- C12-DIFF — one priced door seat. Same night, own 1-unit pool so a hold
-- blocks a competitor without shrinking the $0 GA pool.
INSERT INTO public.talent_offering_variants (
  id, offering_id, label, amount_cents, sort_order, pool_key, admits_per_unit, min_per_order, is_hidden
)
VALUES (
  '33330021-0000-4000-8000-000000000002'::UUID,
  '33330012-0000-4000-8000-000000000007'::UUID,
  'Paid admission', 2000, 20, 'door', 1, 1, FALSE
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  amount_cents = EXCLUDED.amount_cents,
  pool_key = EXCLUDED.pool_key,
  admits_per_unit = EXCLUDED.admits_per_unit,
  updated_at = now();

INSERT INTO public.events (
  id, tenant_id, venue_id, offering_id, slug, title, description,
  status, admission_kind, published_at
)
VALUES (
  '33330022-0000-4000-8000-000000000001'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330010-0000-4000-8000-000000000001'::UUID,
  '33330012-0000-4000-8000-000000000007'::UUID,
  'qa-night',
  'QA Night',
  'Complimentary night for the journeys fixture.',
  'published',
  'ticket',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  offering_id = EXCLUDED.offering_id,
  venue_id = EXCLUDED.venue_id,
  status = 'published',
  published_at = COALESCE(public.events.published_at, now()),
  updated_at = now();

INSERT INTO public.sessions (
  id, tenant_id, offering_id, venue_id, event_id, title, starts_at, ends_at, status
)
VALUES (
  '33330013-0000-4000-8000-000000000002'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  '33330012-0000-4000-8000-000000000007'::UUID,
  '33330010-0000-4000-8000-000000000001'::UUID,
  '33330022-0000-4000-8000-000000000001'::UUID,
  'QA Night',
  now() + interval '2 days',
  now() + interval '2 days 3 hours',
  'scheduled'
)
ON CONFLICT (id) DO UPDATE SET
  event_id = EXCLUDED.event_id,
  offering_id = EXCLUDED.offering_id,
  venue_id = EXCLUDED.venue_id,
  title = EXCLUDED.title,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  status = 'scheduled',
  updated_at = now();

INSERT INTO public.capacity_pools (
  id, tenant_id, subject_kind, subject_id, pool_key, pool_path, units_total, hold_ttl_seconds, is_active
)
VALUES (
  '33330020-0000-4000-8000-000000000004'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'session_tier',
  '33330013-0000-4000-8000-000000000002'::UUID,
  'ga',
  ARRAY['33330020-0000-4000-8000-000000000004'::UUID],
  12,
  900,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  pool_key = EXCLUDED.pool_key,
  units_total = EXCLUDED.units_total,
  is_active = TRUE,
  updated_at = now();

INSERT INTO public.capacity_pools (
  id, tenant_id, subject_kind, subject_id, pool_key, pool_path, units_total, hold_ttl_seconds, is_active
)
VALUES (
  '33330020-0000-4000-8000-000000000005'::UUID,
  '33333333-3333-4333-8333-333333333333'::UUID,
  'session_tier',
  '33330013-0000-4000-8000-000000000002'::UUID,
  'door',
  ARRAY['33330020-0000-4000-8000-000000000005'::UUID],
  1,
  900,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  pool_key = EXCLUDED.pool_key,
  units_total = EXCLUDED.units_total,
  is_active = TRUE,
  updated_at = now();

-- ===========================================================================
-- WORKSPACE B — a workspace that TRANSACTS, not just one that exists (D-011)
-- ===========================================================================
--
-- B used to be an `agencies` row, a domain and an owner membership. That is
-- enough to prove the negative direction of isolation — A's operator cannot
-- see B — and it quietly makes the more important direction untestable.
--
-- WHY AN EMPTY WORKSPACE IS WORSE THAN NO WORKSPACE. The permissions
-- requirement is that "changing a record ID in a request does not bypass
-- authorization". With B empty there is no B record ID to substitute, so such
-- a test can only paste a UUID that exists nowhere — and then "not found" and
-- "forbidden" are indistinguishable. It passes while proving nothing, which is
-- the failure mode this program keeps finding (see the public-menu assertion
-- that agreed with a bug for weeks). Every row below exists so that a
-- cross-workspace attempt has a REAL target: an order that is genuinely
-- there, owned by someone else, that must still be refused.
--
-- B is deliberately a nail salon against A's restaurant, so the pair also
-- covers two different vocabulary presets rather than two copies of one.
--
-- The ids are namespaced `…b<n>` inside the same `3333…` family, so the
-- removal line at the top of this file still collects them.

-- Something upstream of this fixture gives a new workspace a default venue
-- with a generated id, a null slug and a UTC timezone. It cannot be referenced
-- deterministically, and `idx_venues_one_default_per_tenant` allows only one
-- default, so demote whatever is there before claiming the role.
UPDATE public.venues
  SET is_default = FALSE, updated_at = now()
  WHERE tenant_id = '33333333-3333-4333-8333-333333333334'::UUID
    AND is_default
    AND id <> '33330010-0000-4000-8000-0000000000b1'::UUID;

INSERT INTO public.venues (id, tenant_id, name, slug, timezone, is_default, status)
VALUES (
  '33330010-0000-4000-8000-0000000000b1'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  'QA Salon B',
  'qa-salon-b',
  'America/Mexico_City',
  TRUE,
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  timezone = EXCLUDED.timezone,
  is_default = TRUE,
  updated_at = now();

-- A station rather than a table: B is a salon, and the space kinds should not
-- read as a copy of A's floor.
INSERT INTO public.spaces (id, tenant_id, venue_id, kind, name, code, party_min, party_max, status)
VALUES (
  '33330011-0000-4000-8000-0000000000b1'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  '33330010-0000-4000-8000-0000000000b1'::UUID,
  'room', 'Station B1', 'SB1', 1, 1, 'active'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

INSERT INTO public.talent_profiles (
  id, profile_code, display_name, created_by_agency_id,
  profile_kind, booking_terms, visibility, workflow_status, is_test_account,
  claimed_at
)
VALUES (
  '33330003-0000-4000-8000-0000000000b1'::UUID,
  'QA-JNY-B1',
  'QA Journeys B Technician',
  '33333333-3333-4333-8333-333333333334'::UUID,
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
  '33330004-0000-4000-8000-0000000000b1'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  '33330003-0000-4000-8000-0000000000b1'::UUID,
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

-- Booking hours, so B's public booking surface can actually offer a slot. A
-- roster entry without these returns `no_booking_hours`, which is the same
-- production blocker `m0-appointments-dead` tracks: it would have made B look
-- seeded while still refusing every booking.
INSERT INTO public.talent_booking_hours (
  talent_profile_id, tenant_id, timezone, weekly, exceptions,
  slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days
)
VALUES (
  '33330003-0000-4000-8000-0000000000b1'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
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
  tenant_id = EXCLUDED.tenant_id,
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
    '33330012-0000-4000-8000-0000000000b1'::UUID,
    '33333333-3333-4333-8333-333333333334'::UUID,
    '33330003-0000-4000-8000-0000000000b1'::UUID,
    'talent', 'service', 'Acrylic fill', 4200, 'USD',
    'instant', TRUE, 'deposit', 50, 45,
    'published', 'public', 'approved', 10
  ),
  (
    '33330012-0000-4000-8000-0000000000b2'::UUID,
    '33333333-3333-4333-8333-333333333334'::UUID,
    NULL,
    'workspace', 'product', 'Cuticle oil', 900, 'USD',
    'instant', TRUE, 'full', NULL, NULL,
    'published', 'public', 'approved', 0
  )
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

-- A one-unit pool on B's station. Small on purpose: a single unit is what lets
-- a case prove that exhausting B's capacity leaves A's untouched, which is the
-- claim two pools of twelve cannot demonstrate.
INSERT INTO public.capacity_pools (
  id, tenant_id, subject_kind, subject_id, pool_key, pool_path, units_total, hold_ttl_seconds, is_active
)
VALUES (
  '33330020-0000-4000-8000-0000000000b1'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  'space',
  '33330011-0000-4000-8000-0000000000b1'::UUID,
  'default',
  ARRAY['33330020-0000-4000-8000-0000000000b1'::UUID],
  1,
  900,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  units_total = EXCLUDED.units_total,
  is_active = TRUE,
  updated_at = now();

INSERT INTO public.customers (id, tenant_id, email, display_name, phone_e164)
VALUES (
  '33330030-0000-4000-8000-0000000000b1'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  'qa-journeys-b-guest@impronta.test',
  'QA B Guest',
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  updated_at = now();

-- THE POINT OF THIS WHOLE SECTION. A real, settled order belonging to B, so a
-- cross-workspace attempt has something that genuinely exists to be refused
-- access to. Left `paid` rather than `draft` because the interesting refusals
-- are on records worth reading: a receipt, a refund, a line edit.
-- `orders_total_is_derived` is a CHECK, not a convention:
-- total = subtotal - discount + tax. Stating the subtotal explicitly is what
-- keeps the row legal rather than relying on a default that happens to agree.
INSERT INTO public.orders (
  id, tenant_id, customer_id, status, source_channel,
  subtotal_cents, discount_cents, tax_cents, total_cents, currency
)
VALUES (
  '33330031-0000-4000-8000-0000000000b1'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  '33330030-0000-4000-8000-0000000000b1'::UUID,
  'paid',
  'pos',
  900, 0, 0, 900,
  'USD'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  subtotal_cents = EXCLUDED.subtotal_cents,
  total_cents = EXCLUDED.total_cents,
  updated_at = now();

-- `order_lines_payee_xor` requires exactly one of `talent_profile_id` /
-- `owner_tenant_id`: every line names who gets paid for it. This one is a
-- workspace-owned retail product, so the payee is B itself.
INSERT INTO public.order_lines (
  id, order_id, tenant_id, offering_id, owner_tenant_id, label, units, unit_cents, total_cents
)
VALUES (
  '33330032-0000-4000-8000-0000000000b1'::UUID,
  '33330031-0000-4000-8000-0000000000b1'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  '33330012-0000-4000-8000-0000000000b2'::UUID,
  '33333333-3333-4333-8333-333333333334'::UUID,
  'Cuticle oil',
  1,
  900,
  900
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  unit_cents = EXCLUDED.unit_cents,
  total_cents = EXCLUDED.total_cents;


-- ===========================================================================
-- A FLOOR WITH MORE THAN ONE TABLE ON IT (T01/T05/T07/T12/T15/T24).
-- ===========================================================================
--
-- WHY THIS BLOCK EXISTS. The fixture used to carry ONE table, no table
-- combinations at all, and not one admission with a `space_id`. On that data
-- the floor renders a single card, the join picker is always empty, "move"
-- always answers "no free table fits this party", and the derived HELD state
-- can never fire, because held is computed from an admission that names a
-- space. Four of the floor's features were therefore unprovable on the QA
-- host and provable only against unit-test doubles, which is the difference
-- between "the code is right" and "the journey passes".
--
-- THE SHAPE IS CHOSEN, NOT ARBITRARY:
--   T2 + T3   two two-tops that COMBINE for 3 to 4. A walk-in of four fits
--             neither alone (party_max 2 -> party_too_large) and fits the
--             join, which is the Definition-of-Done journey for T15.
--   T4        a four-top: the table tonight's next booking is holding.
--   B1        a booth for 4 to 6, so the floor is not all one kind and the
--             combination T3 + T4 (5 to 6) has a rival a host can choose.
--   T5        a spare two-top, so a MOVE has a destination even while the join
--             demo occupies two tables and the booth is held.
--
-- COMBINATIONS ARE SYMMETRIC ROWS ON PURPOSE. `openVisit` looks up exactly
-- (space_id, with_space_id); the primary table is whichever card the host
-- tapped, so both directions must exist or joining from T3 works and joining
-- the same two tables from T2 does not.
--
-- THE ADMISSIONS ARE RELATIVE TO `now()`. "Held" means due any minute, so a
-- fixed timestamp would be a fixture that is correct for one afternoon. Every
-- row below is stamped from the moment the seed runs and re-stamped by the
-- ON CONFLICT branch, so re-running the seed refreshes tonight's book rather
-- than accumulating a second one.

INSERT INTO public.spaces (id, tenant_id, venue_id, kind, name, code, party_min, party_max, status, sort_order)
VALUES
  ('33330011-0000-4000-8000-000000000011'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, '33330010-0000-4000-8000-000000000001'::UUID, 'table', 'Table 2', 'T2', 1, 2, 'active', 1),
  ('33330011-0000-4000-8000-000000000012'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, '33330010-0000-4000-8000-000000000001'::UUID, 'table', 'Table 3', 'T3', 1, 2, 'active', 2),
  ('33330011-0000-4000-8000-000000000013'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, '33330010-0000-4000-8000-000000000001'::UUID, 'table', 'Table 4', 'T4', 2, 4, 'active', 3),
  ('33330011-0000-4000-8000-000000000014'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, '33330010-0000-4000-8000-000000000001'::UUID, 'booth', 'Booth 1', 'B1', 4, 6, 'active', 4),
  -- T5 exists so "move this party somewhere" has an answer even when the join
  -- demo has taken two tables and the booth is held. A floor where every free
  -- table is the wrong size makes T12 unprovable for a reason that is about
  -- the fixture, not the code.
  ('33330011-0000-4000-8000-000000000015'::UUID, '33333333-3333-4333-8333-333333333333'::UUID, '33330010-0000-4000-8000-000000000001'::UUID, 'table', 'Table 5', 'T5', 1, 2, 'active', 5)
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  code       = EXCLUDED.code,
  kind       = EXCLUDED.kind,
  party_min  = EXCLUDED.party_min,
  party_max  = EXCLUDED.party_max,
  status     = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.space_combinations (tenant_id, space_id, with_space_id, party_min, party_max)
VALUES
  ('33333333-3333-4333-8333-333333333333'::UUID, '33330011-0000-4000-8000-000000000011'::UUID, '33330011-0000-4000-8000-000000000012'::UUID, 3, 4),
  ('33333333-3333-4333-8333-333333333333'::UUID, '33330011-0000-4000-8000-000000000012'::UUID, '33330011-0000-4000-8000-000000000011'::UUID, 3, 4),
  ('33333333-3333-4333-8333-333333333333'::UUID, '33330011-0000-4000-8000-000000000012'::UUID, '33330011-0000-4000-8000-000000000013'::UUID, 5, 6),
  ('33333333-3333-4333-8333-333333333333'::UUID, '33330011-0000-4000-8000-000000000013'::UUID, '33330011-0000-4000-8000-000000000012'::UUID, 5, 6)
ON CONFLICT (space_id, with_space_id) DO UPDATE SET
  party_min = EXCLUDED.party_min,
  party_max = EXCLUDED.party_max;

-- Tonight's book, all four states the floor and the desk have to tell apart.
-- `starts_at` drives everything: `bookState` reads it against `now()` and the
-- venue's grace window, and NOTHING here writes a state column, because there
-- is no state column to write.
INSERT INTO public.admissions (
  id, tenant_id, space_id, holder_name, party_size, admitted_count, starts_at, status
)
VALUES
  -- ARRIVING: due in eight minutes, nobody here yet -> T4 reads "Held".
  ('33330040-0000-4000-8000-000000000001'::UUID, '33333333-3333-4333-8333-333333333333'::UUID,
   '33330011-0000-4000-8000-000000000013'::UUID, 'Ana Ruiz',      2, 0, now() + INTERVAL '8 minutes',  'valid'),
  -- LATE: past the grace window, still nobody -> B1 reads "Held", running late.
  ('33330040-0000-4000-8000-000000000002'::UUID, '33333333-3333-4333-8333-333333333333'::UUID,
   '33330011-0000-4000-8000-000000000014'::UUID, 'Beto Salas',    5, 0, now() - INTERVAL '40 minutes', 'valid'),
  -- BOOKED: hours out. NOT held, and that is the point of having it here: a
  -- floor that held every future booking would strand a room all evening. It
  -- sits on T3, which is free, so "booked does not hold" is proven by the
  -- state and not by the table happening to be busy for another reason.
  ('33330040-0000-4000-8000-000000000003'::UUID, '33333333-3333-4333-8333-333333333333'::UUID,
   '33330011-0000-4000-8000-000000000012'::UUID, 'Carla Nieto',   4, 0, now() + INTERVAL '3 hours',    'valid'),
  -- SEATED: the whole party is in. Also not held -- it is resolved, not imminent.
  ('33330040-0000-4000-8000-000000000004'::UUID, '33333333-3333-4333-8333-333333333333'::UUID,
   '33330011-0000-4000-8000-000000000001'::UUID, 'Diego Paz',     4, 4, now() - INTERVAL '90 minutes', 'valid')
ON CONFLICT (id) DO UPDATE SET
  space_id       = EXCLUDED.space_id,
  holder_name    = EXCLUDED.holder_name,
  party_size     = EXCLUDED.party_size,
  admitted_count = EXCLUDED.admitted_count,
  starts_at      = EXCLUDED.starts_at,
  status         = EXCLUDED.status,
  seated_at      = NULL,
  no_show_at     = NULL,
  completed_at   = NULL,
  updated_at     = now();


COMMIT;
