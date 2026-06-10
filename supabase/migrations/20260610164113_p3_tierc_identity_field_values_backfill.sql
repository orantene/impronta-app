-- ============================================================================
-- P3 — Value unification, Tier C (identity PII text). Migration 2 of 3:
-- Stage-2 BACKFILL. Clones the proven ladder from the Tier-A/Tier-B backfills.
-- For each rostered talent carrying a MEANINGFUL value in the pronouns /
-- pronouns_custom talent_profiles TEXT columns, write a
-- talent_profile_field_values row holding the text VERBATIM (as a jsonb string),
-- with the tenant taken from the talent's ACTIVE roster.
--
-- KEY BRIDGE (column → registry field_key):
--   pronouns        → identity.pronouns
--   pronouns_custom → identity.pronounsCustom
--
-- EXCLUDED: date_of_birth (identity.dob is owned by the legacy mirror, holds a
-- DIFFERENT data source than the column → backfilling from the column would
-- corrupt it; also query-critical) + gender (vocab ambiguity, deferred). Both
-- stay dedicated. See 20260610164112_p3_tierc_register_identity_fields.sql.
--
-- ── PLAIN ON CONFLICT DO NOTHING (no stale-seed purge needed) ───────────────
-- Unlike Tier B (which had a stale 2026-05-16 bios/credits string seed forcing
-- a DELETE-then-INSERT), Tier C's two keys had ZERO pre-existing value rows
-- (verified live). identity.dob HAS value rows but is NOT in this backfill — we
-- never touch its def, so the legacy-mirror rows are untouched. Plain
-- ON CONFLICT DO NOTHING is therefore safe + idempotent: a re-run inserts
-- nothing new because the dual-write/this backfill already wrote the row.
--
-- EMPTINESS contract — shared verbatim with the dual-write helper
-- (identity-field-values-catalog.ts) + the Stage-3 parity SQL:
--   TEXT  present ⇔ col IS NOT NULL AND btrim(col) <> ''
--
-- TENANT: the columns live on talent_profiles (GLOBAL). We attach the tenant
-- from the talent's active roster (DISTINCT ON lowest created_at to dedupe a
-- talent on >1 roster). A talent with NO active roster gets no value row (the
-- column stays the source — matching the dual-write helper, which skips when
-- tenantId is null).
--
-- Idempotent + reversible:
--   DELETE FROM public.talent_profile_field_values tpfv
--    USING public.profile_field_definitions pfd
--    WHERE tpfv.field_definition_id = pfd.id
--      AND pfd.field_key IN ('identity.pronouns','identity.pronounsCustom');
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
SELECT src.talent_profile_id, src.field_definition_id, src.tenant_id, src.value, 'live', 'platform'
FROM (
  -- pronouns: present ⇔ not null AND trim <> '', stored as jsonb string
  SELECT tp.id AS talent_profile_id, pfd.id AS field_definition_id, at.tenant_id,
         to_jsonb(btrim(tp.pronouns)) AS value
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'identity.pronouns'
  WHERE tp.pronouns IS NOT NULL AND btrim(tp.pronouns) <> ''

  UNION ALL
  -- pronouns_custom: present ⇔ not null AND trim <> '', stored as jsonb string
  SELECT tp.id, pfd.id, at.tenant_id, to_jsonb(btrim(tp.pronouns_custom))
  FROM public.talent_profiles tp
  JOIN active_tenant at ON at.talent_profile_id = tp.id
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'identity.pronounsCustom'
  WHERE tp.pronouns_custom IS NOT NULL AND btrim(tp.pronouns_custom) <> ''
) src
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;

COMMIT;
