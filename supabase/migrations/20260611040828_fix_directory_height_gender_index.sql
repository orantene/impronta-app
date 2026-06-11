-- ============================================================================
-- T1.1 — Fix the live directory HEIGHT + GENDER filter (field-engine unification)
--
-- THE BUG (reproduced live on improntamodels.com)
--   The directory height filter returned ~0 for every range and the gender
--   filter was suspect. Both filters read the *indexed denormalized columns*
--   `talent_profiles.height_cm` / `.gender`, which are SPARSELY populated,
--   instead of the authoritative value stores. Live coverage on the directory
--   cohort (deleted_at IS NULL AND is_publicly_hidden = false, 120 talents):
--
--     field   indexed col   System A (field_values)   System B (tpfv)
--     height       27                  70                     51        (union 71)
--     gender       60                   0                     60
--
--   So height search saw 27/120 instead of the real ~71. Example impact:
--   the "175–185 cm" range returned 14 talents; with the column backfilled to
--   the union it returns 33. (Gender's column already == System B exactly —
--   0 per-talent mismatches table-wide — so gender was at parity by value but
--   stays unprotected from future drift.)
--
-- THE FIX (this migration) — make the indexed column TRUSTWORTHY, keep the
-- fast indexed read path (the reader is repointed in a later phase, not here):
--   1. BACKFILL talent_profiles.height_cm + .gender to MAXIMUM coverage from
--      the authoritative stores, coalesce(System B, System A) per talent.
--        • height  → numeric, round(coalesce(B,A))::int  (A & B agree after
--          rounding; verified 0 round-mismatches live). No vocab translation.
--        • gender  → label, sourced from System B (identity.gender), which
--          already holds the canonical labels (Woman / Man / …). NOT from
--          System A (it stores slugs and has 0 gender rows anyway). This keeps
--          the column's label vocabulary intact (the 2026-06-10 normalization
--          set it to Woman/Man and the directory facet matches those labels).
--      Backfill is purely ADDITIVE where the column was empty and IDEMPOTENT
--      where it already agreed (verified 0 column-vs-store conflicts live), so
--      it overwrites nothing that was correct and corrupts no vocabulary.
--
--   2. DRIFT-PROOF the column with DB TRIGGERS on BOTH value stores —
--      field_values (A) and talent_profile_field_values (B) — limited to the
--      height_cm + gender field-definition ids, so the column is recomputed
--      from coalesce(B,A) on every INSERT / UPDATE / DELETE of those value
--      rows. The column can never silently diverge from the value store again.
--
-- VOCAB SAFETY
--   System A stores option SLUGS; System B stores option LABELS. Height is
--   numeric (no translation). Gender is sourced ONLY from System B (already a
--   label), so the column keeps its label vocabulary — System A's slug is never
--   written into the gender column.
--
-- SOURCE OF TRUTH PRECEDENCE = coalesce(B, A) for BOTH fields (System B, the
-- canonical store, wins; System A is the fallback that lights up the ~20 extra
-- height talents B is missing).
--
-- Idempotent + re-runnable. DOWN (manual): drop the two triggers + the two
-- functions; the backfilled column values are left in place (they equal the
-- authoritative coalesce(B,A), so they are correct, not garbage).
-- ============================================================================

BEGIN;

-- ── Resolve the four field-definition ids by KEY (robust to id reissue) ─────
-- Used by both the trigger function and the backfill. Kept inline (not
-- hardcoded UUIDs) so a future re-register of either def can't desync the fix.

-- ── Shared recompute: set talent_profiles.height_cm + .gender for ONE talent
--    from coalesce(System B, System A). SECURITY DEFINER so the trigger can
--    update talent_profiles regardless of the writer's RLS context.
CREATE OR REPLACE FUNCTION public.recompute_talent_height_gender(p_talent_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a_height_def uuid;
  v_b_height_def uuid;
  v_a_gender_def uuid;  -- resolved for completeness; gender sources from B only
  v_b_gender_def uuid;
  v_height int;
  v_gender text;
BEGIN
  IF p_talent_profile_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_a_height_def FROM public.field_definitions WHERE key = 'height_cm' LIMIT 1;
  SELECT id INTO v_b_height_def FROM public.profile_field_definitions WHERE field_key = 'physical.height_cm' LIMIT 1;
  SELECT id INTO v_a_gender_def FROM public.field_definitions WHERE key = 'gender' LIMIT 1;
  SELECT id INTO v_b_gender_def FROM public.profile_field_definitions WHERE field_key = 'identity.gender' LIMIT 1;

  -- HEIGHT = round(coalesce(B, A))::int. B value is jsonb (number or numeric
  -- string); only cast values that look numeric so a stray non-numeric B value
  -- can never abort the writer's transaction (defensive — all live B heights
  -- are numeric, incl. the one stored as the string "181").
  SELECT round(coalesce(
    (
      SELECT (bv.value #>> '{}')::numeric
      FROM public.talent_profile_field_values bv
      WHERE bv.talent_profile_id = p_talent_profile_id
        AND bv.field_definition_id = v_b_height_def
        AND (bv.value #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$'
      LIMIT 1
    ),
    (
      SELECT av.value_number
      FROM public.field_values av
      WHERE av.talent_profile_id = p_talent_profile_id
        AND av.field_definition_id = v_a_height_def
        AND av.value_number IS NOT NULL
      LIMIT 1
    )
  ))::int
  INTO v_height;

  -- GENDER = System B label only (already canonical Woman/Man/…). Never source
  -- the gender column from System A (slug vocab). Trim blanks to NULL.
  SELECT nullif(btrim(bv.value #>> '{}'), '')
  FROM public.talent_profile_field_values bv
  WHERE bv.talent_profile_id = p_talent_profile_id
    AND bv.field_definition_id = v_b_gender_def
  LIMIT 1
  INTO v_gender;

  -- Only write when something actually changed (no-op churn / trigger storms).
  UPDATE public.talent_profiles tp
  SET height_cm = v_height,
      gender = v_gender,
      updated_at = now()
  WHERE tp.id = p_talent_profile_id
    AND (tp.height_cm IS DISTINCT FROM v_height OR tp.gender IS DISTINCT FROM v_gender);
END;
$$;

-- ── Trigger function for the TWO value stores. Fires per value row; cheaply
--    early-returns unless the row's field_definition_id is one of the four
--    height/gender defs, then recomputes the affected talent's columns.
CREATE OR REPLACE FUNCTION public.trg_sync_talent_height_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a_height_def uuid;
  v_b_height_def uuid;
  v_a_gender_def uuid;
  v_b_gender_def uuid;
  v_relevant_defs uuid[];
  v_old_tid uuid;
  v_new_tid uuid;
BEGIN
  SELECT id INTO v_a_height_def FROM public.field_definitions WHERE key = 'height_cm' LIMIT 1;
  SELECT id INTO v_b_height_def FROM public.profile_field_definitions WHERE field_key = 'physical.height_cm' LIMIT 1;
  SELECT id INTO v_a_gender_def FROM public.field_definitions WHERE key = 'gender' LIMIT 1;
  SELECT id INTO v_b_gender_def FROM public.profile_field_definitions WHERE field_key = 'identity.gender' LIMIT 1;
  v_relevant_defs := ARRAY[v_a_height_def, v_b_height_def, v_a_gender_def, v_b_gender_def];

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.field_definition_id = ANY (v_relevant_defs) THEN
      v_old_tid := OLD.talent_profile_id;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.field_definition_id = ANY (v_relevant_defs) THEN
      v_new_tid := NEW.talent_profile_id;
    END IF;
  END IF;

  -- Recompute the affected talent(s). On an UPDATE that re-pointed the row to a
  -- different talent or definition, both the old and new talent are refreshed.
  IF v_new_tid IS NOT NULL THEN
    PERFORM public.recompute_talent_height_gender(v_new_tid);
  END IF;
  IF v_old_tid IS NOT NULL AND v_old_tid IS DISTINCT FROM v_new_tid THEN
    PERFORM public.recompute_talent_height_gender(v_old_tid);
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

-- ── Wire the trigger onto BOTH value stores. AFTER INSERT/UPDATE/DELETE, FOR
--    EACH ROW. Drop-then-create so the migration is re-runnable.
DROP TRIGGER IF EXISTS sync_talent_height_gender ON public.field_values;
CREATE TRIGGER sync_talent_height_gender
  AFTER INSERT OR UPDATE OR DELETE ON public.field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_talent_height_gender();

DROP TRIGGER IF EXISTS sync_talent_height_gender ON public.talent_profile_field_values;
CREATE TRIGGER sync_talent_height_gender
  AFTER INSERT OR UPDATE OR DELETE ON public.talent_profile_field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_talent_height_gender();

-- ── BACKFILL — bring every existing talent's height_cm + gender column up to
--    coalesce(B, A) coverage in one set-based pass. Same logic as the function,
--    expressed as a single UPDATE. Only touches rows that actually change.
WITH defs AS (
  SELECT
    (SELECT id FROM public.field_definitions WHERE key = 'height_cm' LIMIT 1)                      AS a_height,
    (SELECT id FROM public.profile_field_definitions WHERE field_key = 'physical.height_cm' LIMIT 1) AS b_height,
    (SELECT id FROM public.profile_field_definitions WHERE field_key = 'identity.gender' LIMIT 1)    AS b_gender
),
resolved AS (
  SELECT
    tp.id AS talent_profile_id,
    round(coalesce(
      (
        SELECT (bv.value #>> '{}')::numeric
        FROM public.talent_profile_field_values bv, defs
        WHERE bv.talent_profile_id = tp.id
          AND bv.field_definition_id = defs.b_height
          AND (bv.value #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$'
        LIMIT 1
      ),
      (
        SELECT av.value_number
        FROM public.field_values av, defs
        WHERE av.talent_profile_id = tp.id
          AND av.field_definition_id = defs.a_height
          AND av.value_number IS NOT NULL
        LIMIT 1
      )
    ))::int AS new_height,
    (
      SELECT nullif(btrim(bv.value #>> '{}'), '')
      FROM public.talent_profile_field_values bv, defs
      WHERE bv.talent_profile_id = tp.id
        AND bv.field_definition_id = defs.b_gender
      LIMIT 1
    ) AS new_gender
  FROM public.talent_profiles tp
)
UPDATE public.talent_profiles tp
SET height_cm = r.new_height,
    gender = r.new_gender,
    updated_at = now()
FROM resolved r
WHERE tp.id = r.talent_profile_id
  AND (tp.height_cm IS DISTINCT FROM r.new_height OR tp.gender IS DISTINCT FROM r.new_gender);

COMMIT;
