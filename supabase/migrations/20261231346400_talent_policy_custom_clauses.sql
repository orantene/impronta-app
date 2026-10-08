-- Custom clauses on talent booking policies: ordered, free-text rules a talent
-- writes herself, one list per language, versioned with the policy.
--
-- Shape: { "es": string[], "en": string[] }. NULL = no custom clauses (every
-- existing row, and every row published without any). Part of the immutable
-- version: changing the clauses stamps a NEW talent_policy_versions row.
--
-- Additive only: one nullable column, no backfill, no change to existing rows,
-- the immutability trigger, RLS or grants. The app reads and writes tolerate
-- this column being absent, so the code may deploy before this migration.
--
-- A CHECK cannot hold a subquery, so the per-item rule lives in a small
-- IMMUTABLE helper the CHECK calls.

CREATE OR REPLACE FUNCTION public.talent_policy_custom_clauses_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p IS NULL THEN true
    WHEN jsonb_typeof(p) = 'object'
      AND jsonb_typeof(p->'es') = 'array'
      AND jsonb_typeof(p->'en') = 'array'
    THEN (
      jsonb_array_length(p->'es') <= 20
      AND jsonb_array_length(p->'en') <= 20
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements((p->'es') || (p->'en')) AS e(v)
        WHERE jsonb_typeof(e.v) <> 'string' OR char_length(e.v #>> '{}') > 400
      )
    )
    ELSE false
  END;
$$;

ALTER TABLE public.talent_policy_versions
  ADD COLUMN IF NOT EXISTS custom_clauses jsonb;

ALTER TABLE public.talent_policy_versions
  DROP CONSTRAINT IF EXISTS talent_policy_versions_custom_clauses_chk;
ALTER TABLE public.talent_policy_versions
  ADD CONSTRAINT talent_policy_versions_custom_clauses_chk
  CHECK (public.talent_policy_custom_clauses_valid(custom_clauses));

COMMENT ON COLUMN public.talent_policy_versions.custom_clauses IS
  'Talent-written booking rules, { "es": string[], "en": string[] } (max 20 lines per language, 400 chars each). NULL = none. Part of the immutable version; rendered after the generated text on /politicas.';
