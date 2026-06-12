-- ============================================================================
-- T3.3 — DROP legacy System A field tables (`field_definitions` + `field_values`)
--
-- THE CULMINATION of the profile-field-engine unification. System B
-- (`profile_field_definitions` + `talent_profile_field_values`) has been the
-- single source of truth since T2.x; the deployed product code reads/writes
-- System B ONLY (0 non-test `.from("field_definitions"|"field_values")` calls
-- in web/src, the AI/directory/translation read seams were repointed to B in
-- T2.5/T3.2, and B is a proven SUPERSET of A post-T1.2a). The two A tables are
-- FROZEN + UNREFERENCED. This migration removes them for good.
--
-- IRREVERSIBLE — guarded by an ARCHIVE-FIRST recovery net (step 1): a plain
-- snapshot copy of each table is taken before the drop so the data can be
-- restored during the soak window. The archives are purged after the soak.
--
-- DEPENDENCY HANDLING (all mapped + handled here, in order):
--   1. ARCHIVE both tables (recovery net) — `*_archived_20260611` copies.
--   2. REWRITE BOTH height/gender trigger functions to read ONLY System B —
--      they each resolved System-A def-ids from `field_definitions`:
--        a. `recompute_talent_height_gender()` — drop its `field_values`
--           height coalesce leg (B is the proven superset; coverage unchanged).
--        b. `trg_sync_talent_height_gender()` — the AFTER-trigger DISPATCHER.
--           It now fires ONLY on `talent_profile_field_values` (the field_values
--           trigger auto-dropped), so it only ever sees System-B rows; drop its
--           System-A def lookups (`field_definitions`) which would otherwise
--           ERROR on the next B value edit once the table is gone.
--      Both must be rewritten BEFORE `field_definitions`/`field_values` are
--      dropped or the surviving B trigger would error on the next height edit.
--   3. DROP the obsolete reconcile RPC `reconcile_field_mirror_drift()` (it
--      detected A<->B drift; with A gone it is meaningless). The TS cron + lib
--      that called it are removed in the same PR (code side).
--   4. DROP `field_values` THEN `field_definitions` (the lone FK is
--      `field_values.field_definition_id -> field_definitions`; this order
--      satisfies it without CASCADE). The triggers on both tables
--      (`sync_talent_height_gender`, `trg_field_values_invalidate_embedding` on
--      field_values; `field_definitions_group_tenant_guard`,
--      `tr_enforce_preview_visibility`,
--      `trg_field_definitions_ai_visible_invalidate_embeddings` on
--      field_definitions) auto-drop with their tables.
--
-- WHAT SURVIVES (verified):
--   * The trigger function `trg_sync_talent_height_gender()` — SHARED with
--     `talent_profile_field_values`, so it (and its B trigger) stay.
--   * The embedding-invalidation + guard functions that were exclusive to the
--     dropped tables are left in place (orphaned, harmless — only the tables'
--     triggers reference them, and those triggers auto-drop). Cleaning the
--     orphaned functions is out of scope for this drop.
--   * 0 views / matviews depend on either table (verified live).
--
-- DOWN (manual, during soak): recreate the two tables from their archives, then
-- restore the height/gender function's field_values leg + the reconcile RPC from
-- git history.
-- ============================================================================

BEGIN;

-- ── 1. ARCHIVE (recovery net) — plain snapshot copies, data preserved ────────
-- CREATE TABLE AS makes an independent heap copy (no FKs/triggers/indexes
-- carried over), exactly what we want for a cold rollback snapshot.
CREATE TABLE public.field_definitions_archived_20260611 AS
  SELECT * FROM public.field_definitions;

CREATE TABLE public.field_values_archived_20260611 AS
  SELECT * FROM public.field_values;

COMMENT ON TABLE public.field_definitions_archived_20260611 IS
  'T3.3 recovery snapshot of dropped System A field_definitions (39 rows). Purge after soak.';
COMMENT ON TABLE public.field_values_archived_20260611 IS
  'T3.3 recovery snapshot of dropped System A field_values (1155 rows). Purge after soak.';

-- ── 2. REWRITE recompute_talent_height_gender() — System B ONLY ──────────────
-- Drops the `field_values` (System A) coalesce leg for height. Gender already
-- sourced from System B only. B is a proven superset post-T1.2a, so directory
-- height/gender coverage is unchanged. SECURITY DEFINER + signature preserved
-- so the surviving B trigger keeps calling it unchanged.
CREATE OR REPLACE FUNCTION public.recompute_talent_height_gender(p_talent_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b_height_def uuid;
  v_b_gender_def uuid;
  v_height int;
  v_gender text;
BEGIN
  IF p_talent_profile_id IS NULL THEN
    RETURN;
  END IF;

  -- Resolve the canonical System B def-ids by KEY (robust to id reissue).
  SELECT id INTO v_b_height_def FROM public.profile_field_definitions WHERE field_key = 'physical.height_cm' LIMIT 1;
  SELECT id INTO v_b_gender_def FROM public.profile_field_definitions WHERE field_key = 'identity.gender' LIMIT 1;

  -- HEIGHT = round(System B height)::int. B value is jsonb (number or numeric
  -- string); only cast values that look numeric so a stray non-numeric B value
  -- can never abort the writer's transaction (defensive). System A is GONE — no
  -- coalesce fallback; B is the proven superset of A.
  SELECT round((
    SELECT (bv.value #>> '{}')::numeric
    FROM public.talent_profile_field_values bv
    WHERE bv.talent_profile_id = p_talent_profile_id
      AND bv.field_definition_id = v_b_height_def
      AND (bv.value #>> '{}') ~ '^\s*-?\d+(\.\d+)?\s*$'
    LIMIT 1
  ))::int
  INTO v_height;

  -- GENDER = System B label only (already canonical Woman/Man/…). Trim blanks
  -- to NULL.
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

-- ── 2b. REWRITE trg_sync_talent_height_gender() — the AFTER-trigger DISPATCHER
--        on talent_profile_field_values — to resolve only the System-B def-ids.
--        With the field_values trigger gone, it only sees System-B rows, so the
--        System-A (`field_definitions`) lookups are dead AND would error once the
--        table is dropped. RETURN/signature/SECURITY DEFINER preserved.
CREATE OR REPLACE FUNCTION public.trg_sync_talent_height_gender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b_height_def uuid;
  v_b_gender_def uuid;
  v_relevant_defs uuid[];
  v_old_tid uuid;
  v_new_tid uuid;
BEGIN
  SELECT id INTO v_b_height_def FROM public.profile_field_definitions WHERE field_key = 'physical.height_cm' LIMIT 1;
  SELECT id INTO v_b_gender_def FROM public.profile_field_definitions WHERE field_key = 'identity.gender' LIMIT 1;
  v_relevant_defs := ARRAY[v_b_height_def, v_b_gender_def];

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

-- ── 3. DROP the obsolete reconcile RPC (A<->B drift detector — A is gone) ─────
DROP FUNCTION IF EXISTS public.reconcile_field_mirror_drift();

-- ── 4. DROP the two System A tables (FK order: field_values references
--       field_definitions). Their triggers auto-drop with them; the shared
--       trg_sync_talent_height_gender() function survives (still used by
--       talent_profile_field_values). No CASCADE needed.
DROP TABLE public.field_values;
DROP TABLE public.field_definitions;

COMMIT;
