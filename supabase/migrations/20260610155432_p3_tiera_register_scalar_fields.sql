-- ============================================================================
-- P3 — Value unification, Tier A (scalar fields on talent_profiles).
-- Migration 1 of 3: REGISTER the three scalar fields that exist as dedicated
-- talent_profiles columns + bespoke editor controls but were never in the
-- catalog registry. Additive + idempotent.
--
-- The other seven Tier-A scalars are ALREADY registered (by the P0 bespoke
-- registration migration 20260610090001):
--   tagline              → identity.tagline
--   bio_tone             → about.bioTone
--   response_time        → identity.response_time
--   rate_card_visibility → commercial.rateCardVisibility
--   ask_for_quote        → commercial.askForQuote
--   travel_included      → commercial.travelIncluded
--   lodging_included     → commercial.lodgingIncluded
--
-- These three column-backed scalars had NO registered key. The pre-existing
-- `service.has_drivers_license` ("Driver's license") and `travel.passports`
-- ("Passports held") catalog defs are SEMANTICALLY DISTINCT — they are the
-- live-category-fields editor's suppressed list/presence fields, NOT the
-- column-backed enum scalars rendered by the bespoke location editor. So we
-- register fresh, unambiguous keys for the columns:
--   age_display_mode → identity.ageDisplayMode    (enum: exact|range|hidden)
--   passport_status  → logistics.passportStatus   (enum: valid|expired|none)
--   drivers_license  → logistics.driversLicense   (enum: none|standard|international|commercial)
--
-- render_mode='catalog' (these are simple select controls, not coded blobs),
-- storage_mode='dedicated' for now — flipped to 'field_values' by migration 3
-- of 3, after the backfill + parity verification.
--
-- DOWN (manual):
--   DELETE FROM public.profile_field_definitions
--    WHERE field_key IN ('identity.ageDisplayMode','logistics.passportStatus','logistics.driversLicense');
-- ============================================================================

BEGIN;

INSERT INTO public.profile_field_definitions (
  field_key, label, tier, section, kind, options,
  is_optional, admin_only, talent_editable,
  render_mode, storage_mode, display_order
) VALUES
  ('identity.ageDisplayMode',  'Age display mode', 'global', 'identity', 'select',
     '["exact","range","hidden"]'::jsonb,
     TRUE, FALSE, TRUE, 'catalog', 'dedicated', 210),
  ('logistics.passportStatus', 'Passport status',  'global', 'logistics', 'select',
     '["valid","expired","none"]'::jsonb,
     TRUE, FALSE, TRUE, 'catalog', 'dedicated', 1020),
  ('logistics.driversLicense', 'Driver''s license', 'global', 'logistics', 'select',
     '["none","standard","international","commercial"]'::jsonb,
     TRUE, FALSE, TRUE, 'catalog', 'dedicated', 1030)
ON CONFLICT (field_key) DO UPDATE SET
  section      = EXCLUDED.section,
  render_mode  = EXCLUDED.render_mode,
  storage_mode = EXCLUDED.storage_mode,
  options      = EXCLUDED.options,
  label        = COALESCE(EXCLUDED.label, profile_field_definitions.label);

COMMIT;
