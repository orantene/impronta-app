-- ============================================================================
-- T5.2 — Field-engine DB guard + orphan cleanup (Phase 5 capstone)
--
-- The profile-field-engine unification is complete: System B
-- (`profile_field_definitions` registry + `talent_profile_field_values` value
-- store) is the SOLE field system. Legacy System A (`field_definitions` +
-- `field_values`) was dropped in 20261021000000; the dedicated dual-write
-- columns were collapsed in 20261023000000.
--
-- The STRONGEST DB guard already exists and is NOT re-stated here:
--   * The dropped tables cannot be written — they don't exist.
--   * `talent_profile_field_values.field_definition_id` carries a FK to
--     `profile_field_definitions(id)` ON DELETE CASCADE, so an orphan value
--     (a value with no registry definition) is impossible at the database.
--     Verified live before authoring this migration:
--       talent_profile_field_values_field_definition_id_fkey
--         → profile_field_definitions(id)  (confdeltype = 'c' / CASCADE)
--       0 orphan value rows; 309 registry defs; 3237 live value rows.
--
-- This migration therefore adds only what is genuinely valuable and NOT
-- redundant with the FK + the CI guard (check-field-engine-integrity.mjs):
--   1. Documents the FK invariant via a column COMMENT (no behavioural change)
--      — so the "one home per field, no orphan values" contract is discoverable
--      in the schema itself, not only in TS/CI.
--   2. Documents — via a registry-table COMMENT — that System A must never be
--      recreated, pointing at the CI guard that enforces it.
--   3. Drops the orphan embedding function
--      `invalidate_talent_embeddings_for_field_definition_ai_visible()` left
--      behind by the System A drop. It is referenced by 0 triggers (verified
--      live) and references the dropped tables; pure dead-code cleanup.
--
-- DELIBERATELY NOT ADDED: a heavy event/DDL trigger to block recreating
-- field_definitions / field_values. It would be redundant — the FK already
-- makes orphan VALUES impossible, and re-introducing a parallel field SYSTEM
-- is a code+migration change caught at review/CI time by
-- check-field-engine-integrity.mjs (CHECK 1 = no .from() of the dropped tables;
-- CHECK 2 = no CREATE TABLE of them; CHECK 3 = no new parallel *_field_* store).
-- A DDL event trigger would add runtime surface + an admin footgun for zero
-- additional protection over the CI guard, which fails the build BEFORE any
-- such migration can ever be applied.
-- ============================================================================

BEGIN;

-- ── 1. Document the FK invariant (no behavioural change) ─────────────────────
COMMENT ON COLUMN public.talent_profile_field_values.field_definition_id IS
  'FK -> profile_field_definitions(id), ON DELETE CASCADE '
  '(talent_profile_field_values_field_definition_id_fkey). System B is the SOLE '
  'field system: every stored value MUST resolve to a registry definition, so '
  'orphan values are impossible at the DB. Deleting a definition cascades its '
  'values. Do NOT add a second value store — see '
  'web/scripts/check-field-engine-integrity.mjs.';

-- ── 2. Document the no-second-system invariant on the registry table ─────────
COMMENT ON TABLE public.profile_field_definitions IS
  'System B field registry — THE single source of truth for profile fields. '
  'Legacy System A (field_definitions / field_values) was dropped in '
  '20261021000000 and must NEVER be recreated; re-introducing a parallel field '
  'system fails CI via check-field-engine-integrity.mjs.';

-- ── 3. Drop the orphan embedding-invalidation function (dead code) ───────────
-- Left behind by the System A drop (20261021000000). Referenced by 0 triggers
-- (verified live) and references the dropped field_definitions table. Safe to
-- remove; no dependents.
DROP FUNCTION IF EXISTS public.invalidate_talent_embeddings_for_field_definition_ai_visible();

COMMIT;
