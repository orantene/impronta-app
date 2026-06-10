-- ============================================================================
-- P3 — Value unification, Tier-C TAIL (gender). Migration 1 of 3:
-- DEFINE the gender option-set + NORMALIZE the column + RE-SET the directory
-- facet so the facet keeps matching the normalized column.
--
-- WHY GENDER WAS DEFERRED OUT OF THE FIRST TIER-C WAVE
--   The `identity.gender` def was kind='select' with options=NULL, and the
--   talent_profiles.gender column held an inconsistent vocab
--   (female/woman/male/man coexisted — `woman`/`man` from the bespoke editor,
--   `female`/`male` from the legacy onboarding form). Migrating an ambiguous
--   null-options select onto the value table was a smell; the Tier-C agent left
--   gender DEDICATED. This tail closes the gap: it gives gender a clean,
--   inclusive option-set, normalizes the column to those canonical values, and
--   moves the directory facet config in lockstep — THEN the backfill (migration
--   2) + storage-mode flip (migration 3) run the same ladder as pronouns.
--
-- ─── STEP A: the canonical option-set on the engine def ─────────────────────
-- `identity.gender` is kind='select'. We store the DISPLAY values directly as
-- the option strings (no separate id/label) — the bespoke identity editor
-- persists the picker id verbatim into the column, so the stored value == the
-- option == the rendered label. This 14-option list is the inclusive, modern
-- canonical set (shared verbatim with the editor's GENDER_OPTIONS + the three
-- write surfaces' enums + the directory facet config below).
--
-- ─── STEP B: normalize the column to the canonical values ───────────────────
-- Pre-normalization DISTINCT vocab (live, 2026-06-10):
--   female (23), woman (23), male (12), man (1), NULL (61).
-- Mapping (idempotent, case-insensitive):
--   female / woman → Woman
--   male   / man   → Man
-- There were ZERO other non-null values (no non_binary/other/garbage in prod),
-- so no UNKNOWN value is silently coerced. The generic case-insensitive arm
-- below ALSO re-cases any value that already matches a canonical option (e.g. a
-- future 'non-binary' → 'Non-binary'), and LEAVES untouched anything that does
-- not match a canonical option (so an unknown value is preserved, not coerced
-- to a wrong identity).
--
-- ─── STEP C: move the directory gender FACET in lockstep ────────────────────
-- CRITICAL: the directory gender filter is NOT the engine def — it is a
-- SEPARATE System-B `field_definitions` row keyed `gender` whose
-- `config.filter_options` exact-matches the column via
-- `.in("gender", values)` (apply-directory-field-facet-filters.ts). Its old
-- filter_options were lowercase (female/male/non-binary/other/prefer not to
-- say) — they did NOT even match the editor's `woman`/`man` writes (the facet
-- was already partially broken). Normalizing the column WITHOUT moving the
-- facet would break the filter entirely. We re-set filter_options to the SAME
-- canonical vocab here, so the facet matches the normalized column.
--
-- All three steps run in ONE transaction so the column, the engine def, and the
-- facet config can never diverge mid-migration. Idempotent + re-runnable.
--
-- DOWN (manual): restore options=NULL on identity.gender + the old lowercase
-- facet filter_options; the column normalization is not reversible (the
-- original female/male vs woman/man split is lossy → Woman/Man).
-- ============================================================================

BEGIN;

-- STEP A — engine def option-set (the display values the renderer shows).
UPDATE public.profile_field_definitions
   SET options = to_jsonb(ARRAY[
         'Woman','Man','Non-binary','Trans woman','Trans man','Transgender',
         'Genderfluid','Genderqueer','Agender','Bigender','Two-Spirit',
         'Intersex','Prefer to self-describe','Prefer not to say'
       ]::text[]),
       updated_at = now()
 WHERE field_key = 'identity.gender';

-- STEP B — normalize the column to canonical values.
-- B1: the two legacy/editor splits → canonical (case-insensitive).
UPDATE public.talent_profiles
   SET gender = 'Woman'
 WHERE lower(btrim(gender)) IN ('female', 'woman');

UPDATE public.talent_profiles
   SET gender = 'Man'
 WHERE lower(btrim(gender)) IN ('male', 'man');

-- B2: generic re-casing — any value that case-insensitively matches a canonical
-- option gets its canonical casing. UNKNOWN values (no canonical match) are left
-- untouched (preserved, never coerced). Guarded by IS DISTINCT FROM so it is a
-- no-op for already-canonical rows.
UPDATE public.talent_profiles tp
   SET gender = canon.opt
  FROM (
    SELECT unnest(ARRAY[
      'Woman','Man','Non-binary','Trans woman','Trans man','Transgender',
      'Genderfluid','Genderqueer','Agender','Bigender','Two-Spirit',
      'Intersex','Prefer to self-describe','Prefer not to say'
    ]) AS opt
  ) canon
 WHERE tp.gender IS NOT NULL
   AND btrim(tp.gender) <> ''
   AND lower(btrim(tp.gender)) = lower(canon.opt)
   AND tp.gender IS DISTINCT FROM canon.opt;

-- STEP C — move the directory gender facet config in lockstep so the filter
-- keeps exact-matching the normalized column.
UPDATE public.field_definitions
   SET config = jsonb_set(
         COALESCE(config, '{}'::jsonb),
         '{filter_options}',
         to_jsonb(ARRAY[
           'Woman','Man','Non-binary','Trans woman','Trans man','Transgender',
           'Genderfluid','Genderqueer','Agender','Bigender','Two-Spirit',
           'Intersex','Prefer to self-describe','Prefer not to say'
         ]::text[])
       ),
       updated_at = now()
 WHERE key = 'gender';

COMMIT;
