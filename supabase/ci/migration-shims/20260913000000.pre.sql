-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20260913000000_media_variant_kind_polaroid_reel.sql
--
-- WHY IT CANNOT APPLY FROM SCRATCH
--   It applies fine. What it cannot reproduce is the ORDER of
--   public.media_variant_kind's values, which is what ORDER BY and the
--   comparison operators on that column mean.
--
--   This file adds 'polaroid' (§1) and then 'reel' (§2), so a version-ordered
--   replay ends with … hero, polaroid, reel. Production has … hero, reel,
--   polaroid — the other way round.
--
-- WHAT PRODUCTION STATE IT REPRODUCES
--   Production got both values from the OTHER file that adds them,
--   20261111020000_add_reel_polaroid_variant_kinds.sql, and got them first.
--   Two facts fix that:
--
--   1. 20261111020000's header says this file had not reached production when
--      it was written:
--        "The application's UploadVariant type has offered both for months …
--         but the enum never gained the values, so EVERY reel/polaroid upload
--         died at the media_assets insert with 'invalid input value for enum
--         media_variant_kind'."
--      A later-stamped file was therefore applied to production BEFORE this
--      earlier-stamped one — the out-of-order push this directory exists for.
--
--   2. 20261111020000 adds them in the order `reel` then `polaroid`, which is
--      the order database.types.ts reports for production:
--        original, card, gallery, banner, lightbox, public_watermarked,
--        watermarked, hero, reel, polaroid
--
--   Adding them here in 20261111020000's order reproduces that. Both files then
--   skip these values of their own accord: §1/§2 of the migration are guarded
--   by `IF NOT EXISTS (SELECT 1 FROM pg_enum …)`, and 20261111020000 uses
--   ADD VALUE IF NOT EXISTS. Nothing else in either file changes.
--
--   A pre-shim runs on EVERY attempt, including ones the runner makes before
--   the type exists (20250409000000 creates it), so this is guarded on the type
--   existing rather than failing the run.
-- ─────────────────────────────────────────────────────────────────────────────
DO $shim$
BEGIN
  IF to_regtype('public.media_variant_kind') IS NOT NULL THEN
    ALTER TYPE public.media_variant_kind ADD VALUE IF NOT EXISTS 'reel';
    ALTER TYPE public.media_variant_kind ADD VALUE IF NOT EXISTS 'polaroid';
  END IF;
END
$shim$;
