-- ============================================================================
-- P3 — Value unification, Tier D (roster-scoped fields). Stage-2 BACKFILL.
--
-- Clones the proven backfill ladder from
-- `20260923010000_unify_field_values_backfill.sql`: for each
-- `agency_talent_roster` row carrying a MEANINGFUL value in one of the three
-- Tier-D columns, INSERT a `talent_profile_field_values` row, with
--   talent_profile_id   = roster.talent_profile_id
--   field_definition_id = the matching profile_field_definitions row
--   tenant_id           = roster.tenant_id
--   value               = the column value as jsonb (verbatim)
-- ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING.
--
-- KEY BRIDGE (column → registry field_key):
--   internal_notes    → admin.internalNotes
--   emergency_contact → emergency.contact
--   field_locks_data  → admin.fieldLocks
--
-- EMPTINESS contract — shared verbatim with the dual-write helper
-- (roster-field-values-catalog.ts) + the Stage-3 parity SQL so all three agree
-- on which rows get a value row:
--   internal_notes    present ⇔ not null AND trim <> ''
--   emergency_contact present ⇔ not null AND <> '{}'::jsonb
--   field_locks_data  present ⇔ ≥1 lock OR ≥1 reason key
--     ( jsonb_array_length(locks) > 0 OR (reasons IS NOT NULL AND
--       jsonb_typeof(reasons)='object' AND reasons <> '{}'::jsonb) )
--
-- MULTI-ROSTER: the value table is unique on (talent_profile_id,
-- field_definition_id) — one row per talent per field. A talent on >1 active
-- roster could have the column populated on several rosters; we pick exactly
-- ONE per (talent, field) — the meaningful row with the lowest created_at —
-- via DISTINCT ON, so the INSERT never self-conflicts. The column remains the
-- per-tenant authoritative store; this is the lowest-risk tier precisely
-- because the value is rarely tenant-divergent here.
--
-- Idempotent (ON CONFLICT DO NOTHING) + reversible:
--   DELETE FROM public.talent_profile_field_values tpfv
--    USING public.profile_field_definitions pfd
--    WHERE tpfv.field_definition_id = pfd.id
--      AND pfd.field_key IN ('admin.internalNotes','emergency.contact','admin.fieldLocks');
-- ============================================================================

BEGIN;

-- ── 1. internal_notes → admin.internalNotes (text → jsonb string) ──────────
INSERT INTO public.talent_profile_field_values
  (talent_profile_id, field_definition_id, tenant_id, value, workflow_state, last_edited_role)
SELECT DISTINCT ON (src.talent_profile_id, src.field_definition_id)
  src.talent_profile_id, src.field_definition_id, src.tenant_id, src.value, 'live', 'platform'
FROM (
  SELECT
    atr.talent_profile_id,
    pfd.id AS field_definition_id,
    atr.tenant_id,
    to_jsonb(trim(atr.internal_notes)) AS value,
    atr.created_at
  FROM public.agency_talent_roster atr
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'admin.internalNotes'
  WHERE atr.status = 'active'
    AND atr.internal_notes IS NOT NULL
    AND trim(atr.internal_notes) <> ''
) src
ORDER BY src.talent_profile_id, src.field_definition_id, src.created_at ASC
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;

-- ── 2. emergency_contact → emergency.contact (jsonb verbatim) ──────────────
INSERT INTO public.talent_profile_field_values
  (talent_profile_id, field_definition_id, tenant_id, value, workflow_state, last_edited_role)
SELECT DISTINCT ON (src.talent_profile_id, src.field_definition_id)
  src.talent_profile_id, src.field_definition_id, src.tenant_id, src.value, 'live', 'platform'
FROM (
  SELECT
    atr.talent_profile_id,
    pfd.id AS field_definition_id,
    atr.tenant_id,
    atr.emergency_contact AS value,
    atr.created_at
  FROM public.agency_talent_roster atr
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'emergency.contact'
  WHERE atr.status = 'active'
    AND atr.emergency_contact IS NOT NULL
    AND atr.emergency_contact <> '{}'::jsonb
) src
ORDER BY src.talent_profile_id, src.field_definition_id, src.created_at ASC
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;

-- ── 3. field_locks_data → admin.fieldLocks (jsonb verbatim) ────────────────
INSERT INTO public.talent_profile_field_values
  (talent_profile_id, field_definition_id, tenant_id, value, workflow_state, last_edited_role)
SELECT DISTINCT ON (src.talent_profile_id, src.field_definition_id)
  src.talent_profile_id, src.field_definition_id, src.tenant_id, src.value, 'live', 'platform'
FROM (
  SELECT
    atr.talent_profile_id,
    pfd.id AS field_definition_id,
    atr.tenant_id,
    atr.field_locks_data AS value,
    atr.created_at
  FROM public.agency_talent_roster atr
  JOIN public.profile_field_definitions pfd ON pfd.field_key = 'admin.fieldLocks'
  WHERE atr.status = 'active'
    AND atr.field_locks_data IS NOT NULL
    AND (
      jsonb_array_length(COALESCE(atr.field_locks_data->'locks', '[]'::jsonb)) > 0
      OR (
        atr.field_locks_data->'reasons' IS NOT NULL
        AND jsonb_typeof(atr.field_locks_data->'reasons') = 'object'
        AND atr.field_locks_data->'reasons' <> '{}'::jsonb
      )
    )
) src
ORDER BY src.talent_profile_id, src.field_definition_id, src.created_at ASC
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;

COMMIT;
