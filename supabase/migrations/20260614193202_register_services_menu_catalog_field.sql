-- Register the talent services menu as a first-class CATALOG field
-- (commerce.servicesMenu), so it lives inside the field-engine / catalog like
-- the other Tier-B blobs (rates.cards, commercial.packageRates, …) instead of
-- a standalone column. updateTalentServicesMenu now dual-writes the blob into
-- talent_profile_field_values via syncBlobFieldValuesToCatalog (BLOB_FIELD_KEYS
-- gained services_menu → commerce.servicesMenu).
--
-- Mirrors commercial.packageRates (same section/tier/kind/render/storage); a
-- bespoke editor (TalentServicesMenuCard) authors it, so render_mode='bespoke'
-- and the value is stored VERBATIM as an array blob. Additive + idempotent.
--
-- DOWN (manual):
--   DELETE FROM public.profile_field_definitions WHERE field_key = 'commerce.servicesMenu';

BEGIN;

INSERT INTO public.profile_field_definitions (
  field_key, label, tier, section, kind, options,
  is_optional, admin_only, talent_editable,
  render_mode, storage_mode, display_order
) VALUES
  ('commerce.servicesMenu', 'Services menu', 'global', 'commercial_terms', 'textarea',
     NULL, TRUE, FALSE, TRUE, 'bespoke', 'field_values', 360)
ON CONFLICT (field_key) DO UPDATE SET
  section      = EXCLUDED.section,
  render_mode  = EXCLUDED.render_mode,
  storage_mode = EXCLUDED.storage_mode,
  label        = COALESCE(EXCLUDED.label, profile_field_definitions.label);

COMMIT;
