-- Phase 5-β — Backfill canonical talent_profile_field_values from legacy field_values.
--
-- Companion to P5-α parity audit (web/docs/phase-5-parity-audit-2026-05-20T05-29-34.md)
-- and the validated runbook (web/docs/phase-5-execution-runbook-validated-2026-05-19.md).
--
-- Closes the split-brain where 17 bridged keys (NEW_TO_OLD_KEY in
-- web/src/lib/fields/legacy-mirror.ts) had values in the legacy table
-- `field_values` but ZERO rows in the canonical `talent_profile_field_values`
-- store. The α audit found 306 rows would-backfill, 0 value mismatches
-- (canonical is empty for these keys), so we can insert unconditionally
-- when no canonical row exists — no merge / no overwrite logic needed.
--
-- Idempotent: INSERT ... WHERE NOT EXISTS on the (talent_profile_id,
-- field_definition_id) unique pair. Safe to re-run.
--
-- Scope: the 17 keys in NEW_TO_OLD_KEY *minus* the social URL keys
-- (none are bridged today — handle vs URL semantic gap is a separate
-- decision, not in this migration).
--
-- DOWN (manual, audit-grade — there is no clean reverse since we cannot
-- distinguish backfilled rows from later writes; only revert if you
-- know none of the 17 keys received new-path writes since):
--   DELETE FROM public.talent_profile_field_values tpfv
--    USING public.profile_field_definitions pfd
--    WHERE pfd.id = tpfv.field_definition_id
--      AND pfd.field_key IN (
--        'physical.body_type','physical.dress_size','identity.dob',
--        'physical.eye_color','physical.hair_color','physical.hair_length',
--        'physical.height_cm','physical.shoe_size_eu',
--        'experience.years_total','experience.level','experience.notable_work',
--        'experience.professional_highlights','availability.status',
--        'availability.available_for','travel.willing','travel.scope',
--        'media.website_url'
--      )
--      AND tpfv.last_edited_role = 'platform';

BEGIN;

-- Dependency guards: legacy + canonical tables must both exist.
DO $$
BEGIN
  IF to_regclass('public.field_values') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency: public.field_values (legacy field-values layer not applied)';
  END IF;
  IF to_regclass('public.talent_profile_field_values') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency: public.talent_profile_field_values (canonical catalog not applied)';
  END IF;
  IF to_regclass('public.profile_field_definitions') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency: public.profile_field_definitions (canonical catalog not applied)';
  END IF;
  IF to_regclass('public.field_definitions') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency: public.field_definitions (legacy catalog not applied)';
  END IF;
END
$$;

WITH key_map(new_key, old_key) AS (
  VALUES
    ('physical.body_type',                'body_type'),
    ('physical.dress_size',               'clothing_size'),
    ('identity.dob',                      'date_of_birth'),
    ('physical.eye_color',                'eye_color'),
    ('physical.hair_color',               'hair_color'),
    ('physical.hair_length',              'hair_length'),
    ('physical.height_cm',                'height_cm'),
    ('physical.shoe_size_eu',             'shoe_size'),
    ('experience.years_total',            'years_experience'),
    ('experience.level',                  'experience_level'),
    ('experience.notable_work',           'notable_work'),
    ('experience.professional_highlights','professional_highlights'),
    ('availability.status',               'availability_status'),
    ('availability.available_for',        'available_for'),
    ('travel.willing',                    'willing_to_travel'),
    ('travel.scope',                      'travel_scope'),
    ('media.website_url',                 'website_url')
),
-- Resolve canonical tenant_id the same way the write path does
-- (talent-field-values-catalog.ts:62-68): first active roster row.
-- LEFT JOIN — tenant_id is nullable for freelance / orphan talent.
-- The canonical table is tenant-scoped, so orphan legacy values are audited
-- by the runbook and intentionally skipped here instead of inserting NULL.
roster_tenant AS (
  SELECT DISTINCT ON (atr.talent_profile_id)
    atr.talent_profile_id,
    atr.tenant_id
  FROM public.agency_talent_roster atr
  WHERE atr.status = 'active'
  ORDER BY atr.talent_profile_id, atr.created_at ASC
),
src AS (
  SELECT
    fv.talent_profile_id                                      AS talent_profile_id,
    pfd.id                                                    AS new_def_id,
    rt.tenant_id                                              AS tenant_id,
    CASE
      WHEN fv.value_text    IS NOT NULL THEN to_jsonb(fv.value_text)
      WHEN fv.value_number  IS NOT NULL THEN to_jsonb(fv.value_number)
      WHEN fv.value_boolean IS NOT NULL THEN to_jsonb(fv.value_boolean)
      WHEN fv.value_date    IS NOT NULL THEN to_jsonb(fv.value_date::text)
      ELSE NULL
    END                                                       AS value_json
  FROM public.field_values fv
  JOIN public.field_definitions    fd_old ON fd_old.id = fv.field_definition_id
  JOIN key_map km                          ON km.old_key = fd_old.key
  JOIN public.profile_field_definitions pfd ON pfd.field_key = km.new_key
  LEFT JOIN roster_tenant rt               ON rt.talent_profile_id = fv.talent_profile_id
)
INSERT INTO public.talent_profile_field_values
  (tenant_id, talent_profile_id, field_definition_id, value,
   workflow_state, last_edited_role)
SELECT
  src.tenant_id,
  src.talent_profile_id,
  src.new_def_id,
  src.value_json,
  'live',
  'platform'
FROM src
WHERE src.value_json IS NOT NULL
  AND src.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.talent_profile_field_values existing
     WHERE existing.talent_profile_id = src.talent_profile_id
       AND existing.field_definition_id = src.new_def_id
  );

COMMIT;
