-- ============================================================================
-- Multi-Skill Talent Profile V1 — 2026-05-07
-- ============================================================================
--
-- WHY
-- ───
-- Replace the old "1 primary + ≤2 secondary talent_types" model with a
-- richer "1 primary parent + ≤2 secondary parents + up to 9 talent_types
-- total" model.
--
-- Each talent_type now carries:
--   - proficiency_level (5-tier: beginner..master — already in DB)
--   - years_experience (already in DB)
--   - verified_at + new verified_by_user_id + verified_by_tenant_id
--   - verification_note
--   - display_order (for "featured skill" — display_order=0 = featured)
--
-- The picker enforces:
--   - All primary_role rows share one parent_category
--   - secondary_role rows come from at most 2 distinct parent_categories
--   - Total primary + secondary rows ≤ 9
--
-- WHAT
-- ────
-- 1. Schema additions on talent_profile_taxonomy (3 cols)
-- 2. Helper function: parent_category_of(term_id) walks up to level 1
-- 3. Replace old enforce_talent_taxonomy_secondary_cap with
--    enforce_talent_skill_caps (richer constraints)
-- 4. New view talent_skills_resolved for clean reads
--
-- IDEMPOTENT, no data migration required (existing assignments fit the
-- new model directly — Carmen's Influencer primary_role becomes one of up
-- to 5 primary skills under Influencers & Creators parent).
-- ============================================================================

BEGIN;

-- ─── 1. Schema additions ───────────────────────────────────────────────────

ALTER TABLE public.talent_profile_taxonomy
  ADD COLUMN IF NOT EXISTS verified_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS verified_by_tenant_id UUID REFERENCES public.agencies(id),
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

COMMENT ON COLUMN public.talent_profile_taxonomy.verified_by_user_id IS
  'User who verified this skill proficiency. NULL until verified. Distinct from identity verification (lives in talent_profile_trust_badges).';

COMMENT ON COLUMN public.talent_profile_taxonomy.verified_by_tenant_id IS
  'When agency-scoped: which tenant verified. NULL when platform-scoped (Tulala-verified).';

-- ─── 2. Helper: walk parent chain up to level-1 parent_category ────────────

CREATE OR REPLACE FUNCTION public.parent_category_of(p_term_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_id UUID := p_term_id;
  v_term RECORD;
  v_max_iterations INT := 10;
BEGIN
  FOR i IN 1..v_max_iterations LOOP
    SELECT id, parent_id, term_type INTO v_term
    FROM public.taxonomy_terms WHERE id = v_id;
    EXIT WHEN v_term IS NULL OR v_term.term_type = 'parent_category';
    EXIT WHEN v_term.parent_id IS NULL;
    v_id := v_term.parent_id;
  END LOOP;
  -- Return the level-1 parent_category id, or NULL if not found.
  IF v_term IS NULL OR v_term.term_type <> 'parent_category' THEN
    RETURN NULL;
  END IF;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.parent_category_of IS
  'Walks up the parent_id chain from a taxonomy_term to its level-1 parent_category. Returns NULL if no parent_category found within 10 hops.';

-- ─── 3. Replace old trigger with richer skill caps ─────────────────────────

DROP TRIGGER IF EXISTS trg_enforce_talent_taxonomy_secondary_cap ON public.talent_profile_taxonomy;
DROP FUNCTION IF EXISTS public.enforce_talent_taxonomy_secondary_cap();

CREATE OR REPLACE FUNCTION public.enforce_talent_skill_caps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_skills INT;
  v_distinct_secondary_parents INT;
  v_distinct_primary_parents INT;
  v_new_parent UUID;
BEGIN
  -- Skip non-role rows (context, skill, attribute, credential, specialty).
  IF NEW.relationship_type NOT IN ('primary_role', 'secondary_role') THEN
    RETURN NEW;
  END IF;

  -- Compute the parent_category of the incoming term (used for secondary
  -- parent constraint and primary parent constraint).
  v_new_parent := public.parent_category_of(NEW.taxonomy_term_id);

  -- (1) Total cap: ≤ 9 skills (primary + secondary combined).
  -- Excludes the row being updated when TG_OP = 'UPDATE'.
  SELECT count(*)
  INTO v_total_skills
  FROM public.talent_profile_taxonomy tpt
  WHERE tpt.talent_profile_id = NEW.talent_profile_id
    AND tpt.relationship_type IN ('primary_role', 'secondary_role')
    AND (TG_OP = 'INSERT' OR tpt.taxonomy_term_id <> OLD.taxonomy_term_id);

  IF v_total_skills >= 9 THEN
    RAISE EXCEPTION
      'Talent profile % already has 9 skills (max). Remove one before adding another.',
      NEW.talent_profile_id
      USING ERRCODE = '23514';
  END IF;

  -- (2) Primary parent: all primary_role rows must share one parent_category.
  IF NEW.relationship_type = 'primary_role' THEN
    SELECT count(DISTINCT public.parent_category_of(tpt.taxonomy_term_id))
    INTO v_distinct_primary_parents
    FROM public.talent_profile_taxonomy tpt
    WHERE tpt.talent_profile_id = NEW.talent_profile_id
      AND tpt.relationship_type = 'primary_role'
      AND (TG_OP = 'INSERT' OR tpt.taxonomy_term_id <> OLD.taxonomy_term_id)
      AND public.parent_category_of(tpt.taxonomy_term_id) <> v_new_parent;

    IF v_distinct_primary_parents > 0 THEN
      RAISE EXCEPTION
        'All primary skills must share the same parent category. New skill belongs to a different parent.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- (3) Secondary parents: ≤ 2 distinct parent_categories among secondary_role rows.
  IF NEW.relationship_type = 'secondary_role' THEN
    SELECT count(DISTINCT public.parent_category_of(tpt.taxonomy_term_id))
    INTO v_distinct_secondary_parents
    FROM public.talent_profile_taxonomy tpt
    WHERE tpt.talent_profile_id = NEW.talent_profile_id
      AND tpt.relationship_type = 'secondary_role'
      AND (TG_OP = 'INSERT' OR tpt.taxonomy_term_id <> OLD.taxonomy_term_id);

    -- If new row's parent already exists in secondaries, that's fine (adding
    -- another skill in same category). If it'd be a 3rd distinct parent, block.
    IF v_distinct_secondary_parents >= 2 THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_taxonomy tpt
        WHERE tpt.talent_profile_id = NEW.talent_profile_id
          AND tpt.relationship_type = 'secondary_role'
          AND (TG_OP = 'INSERT' OR tpt.taxonomy_term_id <> OLD.taxonomy_term_id)
          AND public.parent_category_of(tpt.taxonomy_term_id) = v_new_parent
      ) THEN
        RAISE EXCEPTION
          'Talent already has skills in 2 secondary categories. New skill would add a 3rd. Pick a category that''s already in use, or remove a category first.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_talent_skill_caps
BEFORE INSERT OR UPDATE OF relationship_type, taxonomy_term_id
ON public.talent_profile_taxonomy
FOR EACH ROW
EXECUTE FUNCTION public.enforce_talent_skill_caps();

COMMENT ON FUNCTION public.enforce_talent_skill_caps IS
  'Multi-skill V1: enforces (1) ≤9 total primary+secondary skills per talent, (2) all primary skills share one parent_category, (3) secondary skills come from ≤2 distinct parent_categories.';

-- ─── 4. View: talent_skills_resolved for clean reads ───────────────────────

CREATE OR REPLACE VIEW public.talent_skills_resolved AS
SELECT
  tpt.talent_profile_id,
  tpt.taxonomy_term_id AS skill_term_id,
  t.slug AS skill_slug,
  t.name_en AS skill_name_en,
  t.name_es AS skill_name_es,
  t.is_generic_fallback,
  public.parent_category_of(t.id) AS parent_category_id,
  pc.slug AS parent_category_slug,
  pc.name_en AS parent_category_name_en,
  tpt.relationship_type,
  tpt.proficiency_level,
  tpt.years_experience,
  tpt.display_order,
  tpt.verified_at IS NOT NULL AS is_verified,
  tpt.verified_at,
  tpt.verified_by_user_id,
  tpt.verified_by_tenant_id,
  tpt.verification_note,
  tpt.tenant_id,
  tpt.created_at,
  tpt.updated_at
FROM public.talent_profile_taxonomy tpt
JOIN public.taxonomy_terms t ON t.id = tpt.taxonomy_term_id
LEFT JOIN public.taxonomy_terms pc ON pc.id = public.parent_category_of(t.id)
WHERE tpt.relationship_type IN ('primary_role', 'secondary_role');

COMMENT ON VIEW public.talent_skills_resolved IS
  'Clean read model for multi-skill profiles: aggregates a talent''s primary + secondary roles with their parent_category, proficiency, years, and verification state. Use this view for picker UIs and search.';

-- ─── 5. Final assertion ────────────────────────────────────────────────────

DO $$
DECLARE
  v_view_count INT;
  v_function_count INT;
  v_trigger_count INT;
BEGIN
  SELECT count(*) INTO v_view_count FROM information_schema.views
    WHERE table_name = 'talent_skills_resolved' AND table_schema = 'public';

  SELECT count(*) INTO v_function_count FROM pg_proc
    WHERE proname IN ('parent_category_of', 'enforce_talent_skill_caps');

  SELECT count(*) INTO v_trigger_count FROM pg_trigger
    WHERE tgname = 'trg_enforce_talent_skill_caps';

  IF v_view_count <> 1 THEN
    RAISE EXCEPTION 'multi_skill_talent_v1: view talent_skills_resolved missing.';
  END IF;
  IF v_function_count <> 2 THEN
    RAISE EXCEPTION 'multi_skill_talent_v1: expected 2 functions, got %.', v_function_count;
  END IF;
  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'multi_skill_talent_v1: trigger trg_enforce_talent_skill_caps missing.';
  END IF;

  RAISE NOTICE 'multi_skill_talent_v1: schema + trigger + view installed.';
END $$;

COMMIT;
