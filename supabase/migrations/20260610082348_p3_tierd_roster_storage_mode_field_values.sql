-- ============================================================================
-- P3 — Value unification, Tier D. Stage-4 metadata flip.
--
-- Now that the backfill is applied + parity verified (zero column↔value
-- mismatches), mark the three roster-scoped registry defs as living in the
-- catalog value table. The loaders read the value row first, falling back to
-- the dedicated column when no value row exists (fallback kept until Stage 5).
--
-- This is metadata only — render_mode stays 'bespoke' (the editors are still
-- hand-coded controls). The dedicated-column WRITE also stays (dual-write); it
-- is removed in Stage 5 (stop write → drop column, a later release).
--
-- Idempotent: re-running re-asserts the same value.
--
-- DOWN (manual):
--   UPDATE public.profile_field_definitions SET storage_mode = 'dedicated'
--    WHERE field_key IN ('admin.internalNotes','emergency.contact','admin.fieldLocks');
-- ============================================================================

BEGIN;

UPDATE public.profile_field_definitions
   SET storage_mode = 'field_values'
 WHERE field_key IN ('admin.internalNotes', 'emergency.contact', 'admin.fieldLocks')
   AND storage_mode <> 'field_values';

COMMIT;
