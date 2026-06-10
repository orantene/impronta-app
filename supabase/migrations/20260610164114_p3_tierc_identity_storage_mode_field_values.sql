-- ============================================================================
-- P3 — Value unification, Tier C (identity PII text). Migration 3 of 3:
-- Stage-4 metadata flip.
--
-- After the backfill (migration 2 of 3) is applied + parity verified (zero
-- column↔value mismatches across all rostered talents, per field), mark the two
-- Tier-C identity-text registry defs as living in the catalog value table. The
-- loaders read the value row first, falling back to the dedicated
-- talent_profiles column when no value row exists (fallback kept until Stage 5).
--
-- Metadata only — render_mode is unchanged (the controls are still drawn by the
-- bespoke identity editor). The dedicated-column WRITE also stays (dual-write);
-- it is removed in Stage 5 (stop write → drop column), a later release.
--
-- identity.pronounsCustom was already registered with storage_mode='field_values'
-- by migration 1 of 3; the guard below makes this a no-op for it. identity.dob
-- + identity.gender are NOT in this set — they stay storage_mode='dedicated'.
--
-- Idempotent: re-running re-asserts the same value.
--
-- DOWN (manual):
--   UPDATE public.profile_field_definitions SET storage_mode = 'dedicated'
--    WHERE field_key IN ('identity.pronouns','identity.pronounsCustom');
-- ============================================================================

BEGIN;

UPDATE public.profile_field_definitions
   SET storage_mode = 'field_values'
 WHERE field_key IN (
     'identity.pronouns',
     'identity.pronounsCustom'
   )
   AND storage_mode <> 'field_values';

COMMIT;
