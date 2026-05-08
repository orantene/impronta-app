-- ============================================================================
-- Phase 3 (taxonomy roster) — talent secondary-type cap (max 2)
-- ============================================================================
--
-- Locked product rule (Oran 2026-05-07):
--   "Talent has only 1 primary category and two secondary optional to add."
--
-- This is a UNIVERSAL cap (not per-plan). Enforced at the DB layer via a
-- constraint trigger on talent_profile_taxonomy so no server action /
-- client bug can ever push a talent above 2 secondaries.
--
-- The talent_profile_taxonomy table tracks both primary and secondary
-- assignments (relationship_type column distinguishes them; see
-- migration 20260801120100_taxonomy_v2_assignments_extend.sql which
-- introduced relationship_type and the unique partial index for
-- exactly-one primary).
--
-- This migration adds the symmetric "at most 2 secondary" rule.

-- ─── Trigger function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_talent_taxonomy_secondary_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_cap   CONSTANT INT := 2;
BEGIN
  IF NEW.relationship_type IS NULL OR NEW.relationship_type <> 'secondary_role' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.talent_profile_taxonomy
   WHERE talent_profile_id = NEW.talent_profile_id
     AND relationship_type = 'secondary_role'
     AND (TG_OP = 'INSERT' OR taxonomy_term_id <> OLD.taxonomy_term_id);

  IF v_count >= v_cap THEN
    RAISE EXCEPTION
      'Talent profile % already has % secondary types (cap=%). Remove one before adding another.',
      NEW.talent_profile_id, v_count, v_cap
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_talent_taxonomy_secondary_cap
  ON public.talent_profile_taxonomy;

CREATE TRIGGER trg_enforce_talent_taxonomy_secondary_cap
BEFORE INSERT OR UPDATE OF relationship_type ON public.talent_profile_taxonomy
FOR EACH ROW
EXECUTE FUNCTION public.enforce_talent_taxonomy_secondary_cap();

COMMENT ON FUNCTION public.enforce_talent_taxonomy_secondary_cap IS
  'Phase 3 — universal cap of 2 secondary talent types per profile. Primary cap (1) is enforced separately by ux_talent_profile_taxonomy_one_primary unique partial index.';
