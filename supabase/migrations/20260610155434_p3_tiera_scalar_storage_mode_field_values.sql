-- ============================================================================
-- P3 — Value unification, Tier A (scalar fields). Migration 3 of 3: Stage-4
-- metadata flip.
--
-- After the backfill (migration 2 of 3) is applied + parity verified (zero
-- column↔value mismatches across all rostered talents), mark the ten Tier-A
-- scalar registry defs as living in the catalog value table. The loaders read
-- the value row first, falling back to the dedicated talent_profiles column
-- when no value row exists (fallback kept until Stage 5).
--
-- Metadata only — render_mode is unchanged (the controls are still drawn by
-- their existing renderers). The dedicated-column WRITE also stays
-- (dual-write); it is removed in Stage 5 (stop write → drop column), a later
-- release.
--
-- Idempotent: re-running re-asserts the same value.
--
-- DOWN (manual):
--   UPDATE public.profile_field_definitions SET storage_mode = 'dedicated'
--    WHERE field_key IN (
--      'identity.tagline','about.bioTone','identity.response_time',
--      'commercial.rateCardVisibility','commercial.askForQuote',
--      'commercial.travelIncluded','commercial.lodgingIncluded',
--      'identity.ageDisplayMode','logistics.passportStatus','logistics.driversLicense');
-- ============================================================================

BEGIN;

UPDATE public.profile_field_definitions
   SET storage_mode = 'field_values'
 WHERE field_key IN (
     'identity.tagline',
     'about.bioTone',
     'identity.response_time',
     'commercial.rateCardVisibility',
     'commercial.askForQuote',
     'commercial.travelIncluded',
     'commercial.lodgingIncluded',
     'identity.ageDisplayMode',
     'logistics.passportStatus',
     'logistics.driversLicense'
   )
   AND storage_mode <> 'field_values';

COMMIT;
