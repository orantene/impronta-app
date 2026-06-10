-- ============================================================================
-- P3 — Value unification, Tier B (editor-only JSONB blobs). Migration 3 of 3:
-- Stage-4 metadata flip.
--
-- After the backfill (migration 2 of 3) is applied + parity verified (zero
-- column↔value mismatches across all rostered talents, per blob), mark the
-- twelve Tier-B blob registry defs as living in the catalog value table. The
-- loaders read the value row first, falling back to the dedicated
-- talent_profiles column when no value row exists (fallback kept until Stage 5).
--
-- Metadata only — render_mode is unchanged (the controls are still drawn by
-- their existing bespoke editors). The dedicated-column WRITE also stays
-- (dual-write); it is removed in Stage 5 (stop write → drop column), a later
-- release.
--
-- logistics.upcomingVisits was already registered with storage_mode='field_values'
-- by migration 1 of 3; the guard below makes this a no-op for it.
--
-- Idempotent: re-running re-asserts the same value.
--
-- DOWN (manual):
--   UPDATE public.profile_field_definitions SET storage_mode = 'dedicated'
--    WHERE field_key IN (
--      'bios','about.personality','rates.cards','commercial.packageRates',
--      'commercial.rateTiers','credits','limits','social_proof.pastClients',
--      'logistics.workEligibility','logistics.upcomingVisits','albums.list','documents');
-- ============================================================================

BEGIN;

UPDATE public.profile_field_definitions
   SET storage_mode = 'field_values'
 WHERE field_key IN (
     'bios',
     'about.personality',
     'rates.cards',
     'commercial.packageRates',
     'commercial.rateTiers',
     'credits',
     'limits',
     'social_proof.pastClients',
     'logistics.workEligibility',
     'logistics.upcomingVisits',
     'albums.list',
     'documents'
   )
   AND storage_mode <> 'field_values';

COMMIT;
