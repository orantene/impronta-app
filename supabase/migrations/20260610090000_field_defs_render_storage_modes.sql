-- Profile-field-engine unification — P0, Migration A.
--
-- Goal of P0: make `profile_field_definitions` register EVERY profile field
-- with the correct editor section, and add two new dimensions that describe
-- HOW a field is rendered + stored. ZERO user-facing behavior change in P0 —
-- the talent editor + client still read the static code catalog; the catalog
-- table just becomes a complete, accurate mirror so the platform-admin
-- "Section Fields" tab can show the same shape as the editor.
--
-- This migration is the schema half:
--   1. WIDEN the `section` CHECK to also allow the profile-editor section
--      slugs (about, services, logistics, availability, commercial_terms,
--      refinement, social_proof, files, verifications, agency_fields, admin,
--      profile_fields, albums, polaroids, details, physical) on top of the
--      16 original DB section values. Migration B then re-tags rows into the
--      real editor slugs — so this WIDEN must land FIRST, in the same txn,
--      before any re-tag UPDATE.
--   2. ADD render_mode  — 'catalog'  = rendered by the generic catalog field
--                         renderer; 'bespoke' = rendered by a hand-coded
--                         editor component (complex/coded controls).
--   3. ADD storage_mode — 'field_values' = stored in talent_profile_field_values
--                         (the type-specific bag); 'dedicated' = stored in a
--                         dedicated column / structured store on the profile.
--   4. BACKFILL storage_mode='dedicated' for universal + global tiers
--      (type-specific rows keep the default 'field_values').
--
-- All steps idempotent (guarded / IF NOT EXISTS). CHECK-widen happens before
-- the column adds, and before any data move (Migration B).
--
-- DOWN (manual):
--   ALTER TABLE public.profile_field_definitions
--     DROP COLUMN IF EXISTS render_mode,
--     DROP COLUMN IF EXISTS storage_mode;
--   (restore the original narrow `section` CHECK from 20260901120000)

BEGIN;

-- ── 1. Widen the `section` CHECK ───────────────────────────────────────────
-- The constraint name from 20260901120000 is the table-default
-- "profile_field_definitions_section_check". Drop + re-add with the union of
-- the 16 original values and the editor slugs. Guarded so re-running is safe.

ALTER TABLE public.profile_field_definitions
  DROP CONSTRAINT IF EXISTS profile_field_definitions_section_check;

ALTER TABLE public.profile_field_definitions
  ADD CONSTRAINT profile_field_definitions_section_check
  CHECK (section IN (
    -- original 16 (20260901120000)
    'identity', 'location', 'languages', 'media',
    'measurements', 'wardrobe', 'rates', 'travel', 'skills',
    'limits', 'credits', 'reviews', 'social', 'documents',
    'emergency', 'type-specific',
    -- profile-editor section slugs (PROFILE_SECTIONS / SECTION_META)
    'about', 'services', 'logistics', 'availability', 'commercial_terms',
    'refinement', 'social_proof', 'files', 'verifications', 'agency_fields',
    'admin', 'profile_fields', 'albums', 'polaroids', 'details', 'physical'
  ));

-- ── 2. render_mode ─────────────────────────────────────────────────────────

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS render_mode TEXT NOT NULL DEFAULT 'catalog';

-- Add the CHECK separately + guarded so re-running doesn't error on the
-- already-present constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profile_field_definitions'::regclass
      AND conname  = 'profile_field_definitions_render_mode_check'
  ) THEN
    ALTER TABLE public.profile_field_definitions
      ADD CONSTRAINT profile_field_definitions_render_mode_check
      CHECK (render_mode IN ('catalog', 'bespoke'));
  END IF;
END $$;

-- ── 3. storage_mode ────────────────────────────────────────────────────────

ALTER TABLE public.profile_field_definitions
  ADD COLUMN IF NOT EXISTS storage_mode TEXT NOT NULL DEFAULT 'field_values';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profile_field_definitions'::regclass
      AND conname  = 'profile_field_definitions_storage_mode_check'
  ) THEN
    ALTER TABLE public.profile_field_definitions
      ADD CONSTRAINT profile_field_definitions_storage_mode_check
      CHECK (storage_mode IN ('field_values', 'dedicated'));
  END IF;
END $$;

-- ── 4. Backfill storage_mode for universal + global tiers ──────────────────
-- Universal + global fields live as dedicated columns / structured stores on
-- the profile (legalName, pronouns, media, rates, …) — not in the
-- field_values bag. Type-specific fields keep the default 'field_values'.
-- Idempotent: re-running just re-asserts the same value.

UPDATE public.profile_field_definitions
   SET storage_mode = 'dedicated'
 WHERE tier IN ('universal', 'global')
   AND storage_mode <> 'dedicated';

COMMENT ON COLUMN public.profile_field_definitions.render_mode IS
  'How the field renders in the talent editor: ''catalog'' = generic catalog field renderer; ''bespoke'' = hand-coded editor component (complex/coded control). P0 is descriptive only — the editor still reads the static code catalog.';
COMMENT ON COLUMN public.profile_field_definitions.storage_mode IS
  'Where a value is stored: ''field_values'' = talent_profile_field_values bag (type-specific); ''dedicated'' = a dedicated column / structured store on the profile (universal + global).';

COMMIT;
