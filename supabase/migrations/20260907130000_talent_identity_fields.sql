-- ============================================================================
-- Phase 3 (master plan / deep QA fix) — talent_profiles identity fields
-- ============================================================================
--
-- The prototype's IdentityEditor (web/src/app/prototypes/admin-shell/_drawers.tsx
-- around line 8619) edits a `ProfileIdentity` shape (web/src/app/prototypes/
-- admin-shell/_state.tsx:4961) with 7 fields the database can't currently
-- store. Until this migration the rich talent profile editor was a UI-only
-- prototype: every save was a toast + closeDrawer with no DB write.
--
-- This migration brings the schema in line with the product spec for
-- IDENTITY only. Services, Location, Media, Albums, Polaroids, About tabs
-- will follow in subsequent migrations as their editors get wired up.
--
-- New columns (all nullable, zero-impact backfill — no existing rows touched):
--   legal_name             TEXT     — KYC / contracts. Admin-only display.
--   pronunciation          TEXT     — Phonetic, e.g. "soh-FEE-ah loo-PO".
--   pronouns               TEXT     — One of: she_her, he_him, they_them,
--                                    ze_zir, custom. NULL = unset.
--   pronouns_custom        TEXT     — Free-text used when pronouns='custom'.
--   age_display_mode       TEXT     — exact | range | hidden. Default 'range'.
--   response_time          TEXT     — Self-declared SLA: 1h | 4h | 24h | 48h.
--   field_visibility       JSONB    — Per-field channel override map.
--                                    Keys are short ids (legalName, pronouns,
--                                    gender, dob); values are arrays of
--                                    channels (public | agency | private).
--                                    Defaults to '{}' = use type-default.
--
-- Cardinality / contracts:
--   - All NULL-safe; nothing required at insert.
--   - CHECK constraints validate enum-shaped strings. JSONB shape NOT
--     enforced at DB level — validation lives in the server action.
--   - No RLS changes; existing policies cover the new columns transitively.

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS legal_name        TEXT,
  ADD COLUMN IF NOT EXISTS pronunciation     TEXT,
  ADD COLUMN IF NOT EXISTS pronouns          TEXT,
  ADD COLUMN IF NOT EXISTS pronouns_custom   TEXT,
  ADD COLUMN IF NOT EXISTS age_display_mode  TEXT NOT NULL DEFAULT 'range',
  ADD COLUMN IF NOT EXISTS response_time     TEXT,
  ADD COLUMN IF NOT EXISTS field_visibility  JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── CHECK constraints (additive, named for future drop-if-needed) ────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'talent_profiles_pronouns_chk'
  ) THEN
    ALTER TABLE public.talent_profiles
      ADD CONSTRAINT talent_profiles_pronouns_chk
      CHECK (pronouns IS NULL OR pronouns IN ('she_her','he_him','they_them','ze_zir','custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'talent_profiles_age_display_chk'
  ) THEN
    ALTER TABLE public.talent_profiles
      ADD CONSTRAINT talent_profiles_age_display_chk
      CHECK (age_display_mode IN ('exact','range','hidden'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'talent_profiles_response_time_chk'
  ) THEN
    ALTER TABLE public.talent_profiles
      ADD CONSTRAINT talent_profiles_response_time_chk
      CHECK (response_time IS NULL OR response_time IN ('1h','4h','24h','48h'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'talent_profiles_field_visibility_obj_chk'
  ) THEN
    ALTER TABLE public.talent_profiles
      ADD CONSTRAINT talent_profiles_field_visibility_obj_chk
      CHECK (jsonb_typeof(field_visibility) = 'object');
  END IF;
END
$$;

-- ─── Comments for self-describing schema ──────────────────────────────────────

COMMENT ON COLUMN public.talent_profiles.legal_name IS
  'KYC / contracts. Never on public profile. Admin-only display per field_visibility default.';
COMMENT ON COLUMN public.talent_profiles.pronunciation IS
  'Phonetic pronunciation aid for the talent''s name (e.g. "soh-FEE-ah loo-PO").';
COMMENT ON COLUMN public.talent_profiles.pronouns IS
  'Enumerated pronouns: she_her | he_him | they_them | ze_zir | custom. NULL = unset.';
COMMENT ON COLUMN public.talent_profiles.pronouns_custom IS
  'Free-text pronouns used when pronouns=''custom''. Ignored otherwise.';
COMMENT ON COLUMN public.talent_profiles.age_display_mode IS
  'How age is displayed publicly: exact (29) | range (28-32) | hidden. Default range.';
COMMENT ON COLUMN public.talent_profiles.response_time IS
  'Self-declared reply-time commitment displayed on Discover: 1h | 4h | 24h | 48h.';
COMMENT ON COLUMN public.talent_profiles.field_visibility IS
  'Per-field visibility channel overrides. Object keyed by field short-id (legalName, pronouns, gender, dob), values are arrays of channels (public, agency, private). Empty object = use field-type defaults.';
