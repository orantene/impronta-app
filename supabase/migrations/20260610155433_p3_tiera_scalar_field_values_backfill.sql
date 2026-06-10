-- ============================================================================
-- P3 — Value unification, Tier A (scalar fields). Migration 2 of 3: Stage-2
-- BACKFILL. Clones the proven ladder from the Tier-D backfill
-- (20260610082316). For each talent carrying a MEANINGFUL value in one of the
-- ten Tier-A talent_profiles columns, INSERT a talent_profile_field_values row
-- with the tenant taken from the talent's ACTIVE roster.
--
-- KEY BRIDGE (column → registry field_key):
--   tagline              → identity.tagline
--   bio_tone             → about.bioTone
--   response_time        → identity.response_time
--   rate_card_visibility → commercial.rateCardVisibility
--   ask_for_quote        → commercial.askForQuote
--   travel_included      → commercial.travelIncluded
--   lodging_included     → commercial.lodgingIncluded
--   age_display_mode     → identity.ageDisplayMode
--   passport_status      → logistics.passportStatus
--   drivers_license      → logistics.driversLicense
--
-- TENANT: Tier-A columns live on talent_profiles (GLOBAL, one value per
-- talent), but the value table needs a tenant. We attach the tenant from the
-- talent's active roster (DISTINCT ON lowest created_at to dedupe a talent on
-- >1 roster). A talent with NO active roster gets no value row (the column
-- stays the source — matching the dual-write helper, which skips when
-- tenantId is null).
--
-- EMPTINESS contract — shared verbatim with the dual-write helper
-- (scalar-field-values-catalog.ts) + the Stage-3 parity SQL:
--   TEXT scalars    present ⇔ not null AND trim(col) <> ''
--   BOOLEAN scalars present ⇔ col IS NOT NULL   (a stored `false` is REAL)
-- The boolean + NOT-NULL text columns (ask_for_quote/travel_included/
-- lodging_included/age_display_mode/rate_card_visibility) are NOT NULL with a
-- default, so they are present for every talent — every rostered talent gets a
-- value row for them. That is correct: the dual-write upserts them on every
-- save, so parity requires them populated here too.
--
-- Values stored as to_jsonb(col) verbatim (text → jsonb string; boolean →
-- jsonb boolean), matching the helper's upsert payload.
--
-- Idempotent (ON CONFLICT DO NOTHING) + reversible:
--   DELETE FROM public.talent_profile_field_values tpfv
--    USING public.profile_field_definitions pfd
--    WHERE tpfv.field_definition_id = pfd.id
--      AND pfd.field_key IN (
--        'identity.tagline','about.bioTone','identity.response_time',
--        'commercial.rateCardVisibility','commercial.askForQuote',
--        'commercial.travelIncluded','commercial.lodgingIncluded',
--        'identity.ageDisplayMode','logistics.passportStatus','logistics.driversLicense');
-- ============================================================================

BEGIN;

-- One CTE resolves the active-roster tenant per talent (lowest created_at when
-- the talent is on more than one active roster), so every column INSERT shares
-- the same tenant resolution.
WITH active_tenant AS (
  SELECT DISTINCT ON (atr.talent_profile_id)
    atr.talent_profile_id,
    atr.tenant_id
  FROM public.agency_talent_roster atr
  WHERE atr.status = 'active' AND atr.tenant_id IS NOT NULL
  ORDER BY atr.talent_profile_id, atr.created_at ASC
)
INSERT INTO public.talent_profile_field_values
  (talent_profile_id, field_definition_id, tenant_id, value, workflow_state, last_edited_role)
SELECT src.talent_profile_id, src.field_definition_id, src.tenant_id, src.value, 'live', 'platform'
FROM (
  -- ── TEXT scalars: present ⇔ not null AND trim <> '' ──────────────────────
  SELECT tp.id AS talent_profile_id, pfd.id AS field_definition_id, at.tenant_id,
         to_jsonb(trim(tp.tagline)) AS value
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'identity.tagline'
  WHERE tp.tagline IS NOT NULL AND trim(tp.tagline) <> ''

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(trim(tp.bio_tone))
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'about.bioTone'
  WHERE tp.bio_tone IS NOT NULL AND trim(tp.bio_tone) <> ''

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(trim(tp.response_time))
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'identity.response_time'
  WHERE tp.response_time IS NOT NULL AND trim(tp.response_time) <> ''

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(trim(tp.rate_card_visibility))
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'commercial.rateCardVisibility'
  WHERE tp.rate_card_visibility IS NOT NULL AND trim(tp.rate_card_visibility) <> ''

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(trim(tp.age_display_mode))
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'identity.ageDisplayMode'
  WHERE tp.age_display_mode IS NOT NULL AND trim(tp.age_display_mode) <> ''

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(trim(tp.passport_status))
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'logistics.passportStatus'
  WHERE tp.passport_status IS NOT NULL AND trim(tp.passport_status) <> ''

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(trim(tp.drivers_license))
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'logistics.driversLicense'
  WHERE tp.drivers_license IS NOT NULL AND trim(tp.drivers_license) <> ''

  -- ── BOOLEAN scalars: present ⇔ IS NOT NULL (false is a real value) ───────
  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(tp.ask_for_quote)
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'commercial.askForQuote'
  WHERE tp.ask_for_quote IS NOT NULL

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(tp.travel_included)
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'commercial.travelIncluded'
  WHERE tp.travel_included IS NOT NULL

  UNION ALL
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(tp.lodging_included)
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'commercial.lodgingIncluded'
  WHERE tp.lodging_included IS NOT NULL
) src
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;

COMMIT;
