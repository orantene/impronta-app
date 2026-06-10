-- ============================================================================
-- P3 — Value unification, Tier C (identity PII text on talent_profiles).
-- Migration 1 of 3: REGISTER the one Tier-C field whose registry key does not
-- yet exist. Additive + idempotent.
--
-- SCOPE (the conservative, provably-safe subset — see the helper file
-- web/src/lib/talent/identity-field-values-catalog.ts for the full
-- reconciliation):
--   pronouns        → identity.pronouns        (ALREADY registered, P0; no-op here)
--   pronouns_custom → identity.pronounsCustom  (registered fresh by this migration)
--
-- DELIBERATELY EXCLUDED from Tier C:
--   • date_of_birth → identity.dob — the legacy mirror (legacy-mirror.ts)
--     ALREADY writes identity.dob value rows from the OLD System-A field_values
--     (NOT the talent_profiles.date_of_birth column); the two stores hold
--     DIFFERENT data (column ≠ catalog in 19/19 both-present rows). A P3
--     backfill would corrupt the legacy-bridged source. DOB is also
--     query-critical (directory age filter reads the column directly). DOB
--     stays DEDICATED; the legacy mirror keeps owning its value rows.
--   • gender → identity.gender — no collision + not column-queried, so
--     mechanically migratable, but the def is kind='select' with options=NULL
--     and the column vocab is inconsistent (woman/female/male/man). Deferred to
--     a follow-up that first cleans the gender option-set. Stays DEDICATED.
--
-- identity.pronounsCustom: free-text companion to the pronouns enum, rendered by
-- the bespoke identity editor (render_mode='bespoke'). storage_mode='field_values'
-- so the catalog reads it from the value table once the backfill (migration 2)
-- + parity verification land. The dedicated column write stays the dual-write
-- source until Stage 5. display_order 105 (just after identity.pronouns@100,
-- before identity.whatsapp@140).
--
-- DOWN (manual):
--   DELETE FROM public.profile_field_definitions WHERE field_key = 'identity.pronounsCustom';
-- ============================================================================

BEGIN;

INSERT INTO public.profile_field_definitions (
  field_key, label, tier, section, kind, options,
  is_optional, admin_only, talent_editable,
  render_mode, storage_mode, display_order
) VALUES
  ('identity.pronounsCustom', 'Custom pronouns', 'universal', 'identity', 'text',
     NULL, TRUE, FALSE, TRUE, 'bespoke', 'field_values', 105)
ON CONFLICT (field_key) DO UPDATE SET
  section      = EXCLUDED.section,
  render_mode  = EXCLUDED.render_mode,
  storage_mode = EXCLUDED.storage_mode,
  label        = COALESCE(EXCLUDED.label, profile_field_definitions.label);

COMMIT;
