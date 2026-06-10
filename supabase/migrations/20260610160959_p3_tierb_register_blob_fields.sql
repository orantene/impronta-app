-- ============================================================================
-- P3 — Value unification, Tier B (editor-only JSONB blobs on talent_profiles).
-- Migration 1 of 3: REGISTER the one Tier-B blob whose registry key does not
-- yet exist. Additive + idempotent.
--
-- Eleven of the twelve Tier-B blobs are ALREADY registered (verified live):
--   bios               → bios                       (P0)
--   personality_traits → about.personality          (P0)
--   rates_data         → rates.cards                (P0)
--   package_rates_data → commercial.packageRates    (P0)
--   rate_tiers_data    → commercial.rateTiers       (P0)
--   credits_data       → credits                    (pre-existing)
--   limits_data        → limits                     (pre-existing)
--   social_proof_data  → social_proof.pastClients   (P0)
--   work_eligibility   → logistics.workEligibility  (P0)
--   media_albums_data  → albums.list                (P0)
--   documents_data     → documents                  (P0)
--
-- Only `upcoming_visits` had NO registered key. We register a fresh,
-- unambiguous key under the logistics section (it is the talent's planned
-- travel windows — a logistics concern, alongside logistics.workEligibility).
-- render_mode='bespoke' (a coded editor list, not a generic catalog control),
-- storage_mode='field_values' so the catalog reads it from the value table
-- once the backfill (migration 2) + parity verification land. The dedicated
-- column write stays as the dual-write source until Stage 5.
--
-- DOWN (manual):
--   DELETE FROM public.profile_field_definitions WHERE field_key = 'logistics.upcomingVisits';
-- ============================================================================

BEGIN;

INSERT INTO public.profile_field_definitions (
  field_key, label, tier, section, kind, options,
  is_optional, admin_only, talent_editable,
  render_mode, storage_mode, display_order
) VALUES
  ('logistics.upcomingVisits', 'Upcoming visits', 'global', 'logistics', 'textarea',
     NULL, TRUE, FALSE, TRUE, 'bespoke', 'field_values', 1015)
ON CONFLICT (field_key) DO UPDATE SET
  section      = EXCLUDED.section,
  render_mode  = EXCLUDED.render_mode,
  storage_mode = EXCLUDED.storage_mode,
  label        = COALESCE(EXCLUDED.label, profile_field_definitions.label);

COMMIT;
