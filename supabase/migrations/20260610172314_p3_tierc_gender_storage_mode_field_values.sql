-- ============================================================================
-- P3 — Value unification, Tier-C TAIL (gender). Migration 3 of 3:
-- Stage-4 metadata flip.
--
-- After the backfill (migration 2 of 3) is applied + parity verified (zero
-- column↔value mismatches across all rostered talents with a non-empty gender),
-- mark the `identity.gender` registry def as living in the catalog value table.
-- The loaders read the value row first, falling back to the dedicated
-- talent_profiles.gender column when no value row exists (fallback kept until
-- Stage 5).
--
-- Metadata only — render_mode is unchanged ('catalog'; the gender control is
-- still drawn by the bespoke identity editor / catalog-driven wizard). The
-- dedicated-column WRITE also stays (dual-write); it is removed in Stage 5
-- (stop write → drop column), a later release.
--
-- identity.dob is NOT in this set — it stays storage_mode='dedicated' (owned by
-- the legacy mirror; see 20260610164114).
--
-- Idempotent: re-running re-asserts the same value.
--
-- DOWN (manual):
--   UPDATE public.profile_field_definitions SET storage_mode = 'dedicated'
--    WHERE field_key = 'identity.gender';
-- ============================================================================

BEGIN;

UPDATE public.profile_field_definitions
   SET storage_mode = 'field_values'
 WHERE field_key = 'identity.gender'
   AND storage_mode <> 'field_values';

COMMIT;
