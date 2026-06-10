-- ============================================================================
-- P3 — Value unification, Tier-C TAIL (gender). Migration 2 of 3:
-- Stage-2 BACKFILL. Clones the proven ladder from the Tier-C pronouns backfill
-- (20260610164113). For each rostered talent carrying a MEANINGFUL value in the
-- now-normalized talent_profiles.gender column, write a
-- talent_profile_field_values row holding the value VERBATIM (as a jsonb
-- string), with the tenant taken from the talent's ACTIVE roster.
--
-- KEY BRIDGE (column → registry field_key):
--   gender → identity.gender
--
-- ORDER DEPENDENCY: this MUST run AFTER 20260610172312 (which normalizes the
-- column to the canonical values), so the value rows are seeded with canonical
-- gender strings (Woman/Man/…), not the old female/woman/male/man mix.
--
-- ── PLAIN ON CONFLICT DO NOTHING (no stale-seed purge needed) ───────────────
-- identity.gender had ZERO pre-existing value rows (verified live, 2026-06-10),
-- so a plain ON CONFLICT DO NOTHING is safe + idempotent: a re-run inserts
-- nothing new because the dual-write / this backfill already wrote the row.
--
-- EMPTINESS contract — shared verbatim with the dual-write helper
-- (identity-field-values-catalog.ts) + the Stage-3 parity SQL:
--   present ⇔ col IS NOT NULL AND btrim(col) <> ''
--
-- TENANT: gender lives on talent_profiles (GLOBAL). We attach the tenant from
-- the talent's active roster (DISTINCT ON lowest created_at to dedupe a talent
-- on >1 roster). A talent with NO active roster gets no value row (the column
-- stays the source — matching the dual-write helper, which skips when tenantId
-- is null).
--
-- Idempotent + reversible:
--   DELETE FROM public.talent_profile_field_values tpfv
--    USING public.profile_field_definitions pfd
--    WHERE tpfv.field_definition_id = pfd.id
--      AND pfd.field_key = 'identity.gender';
-- ============================================================================

BEGIN;

WITH active_tenant AS (
  SELECT DISTINCT ON (atr.talent_profile_id)
    atr.talent_profile_id,
    atr.tenant_id
  FROM public.agency_talent_roster atr
  WHERE atr.status = 'active' AND atr.tenant_id IS NOT NULL
  ORDER BY atr.talent_profile_id, atr.created_at ASC
)
INSERT INTO public.talent_profile_field_values
  (talent_profile_id, field_definition_id, tenant_id, value, workflow_state, last_edited_role)
SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(btrim(tp.gender)), 'live', 'platform'
FROM public.talent_profiles tp
JOIN active_tenant at ON at.talent_profile_id = tp.id
JOIN public.profile_field_definitions pfd ON pfd.field_key = 'identity.gender'
WHERE tp.gender IS NOT NULL AND btrim(tp.gender) <> ''
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;

COMMIT;
