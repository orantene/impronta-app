-- ============================================================================
-- Aspiration + RLS V1 — 2026-05-07
-- ============================================================================
--
-- WHY
-- ───
-- 1. The legacy ServicesEditor had a "Career interests" / aspirations field
--    (talent_types they're open to growing into). The new SkillSlotPanel
--    drops that flow because relationship_type CHECK doesn't allow
--    'aspiration'. This migration adds it.
--
-- 2. talent_profile_taxonomy currently has no RLS. Before exposing
--    talent-side editing of skills, we need policies so:
--      - Talent can SELECT/INSERT/UPDATE/DELETE only their own rows
--      - Agency staff can manage rows for talent on their roster
--      - Service-role (admin operations) bypass RLS
--
-- WHAT
-- ────
-- 1. Drop + recreate relationship_type CHECK to add 'aspiration'.
-- 2. Enable RLS on talent_profile_taxonomy.
-- 3. Three policies: talent self-access, agency-roster access, service-role.
-- ============================================================================

BEGIN;

-- ─── 1. Add 'aspiration' to relationship_type CHECK ───────────────────────

ALTER TABLE public.talent_profile_taxonomy
  DROP CONSTRAINT IF EXISTS talent_profile_taxonomy_relationship_type_check;

ALTER TABLE public.talent_profile_taxonomy
  ADD CONSTRAINT talent_profile_taxonomy_relationship_type_check
  CHECK (
    relationship_type = ANY (
      ARRAY[
        'primary_role',
        'secondary_role',
        'specialty',
        'skill',
        'context',
        'credential',
        'attribute',
        'aspiration'
      ]
    )
  );

COMMENT ON CONSTRAINT talent_profile_taxonomy_relationship_type_check
  ON public.talent_profile_taxonomy IS
  'Allowed relationship types between talent and taxonomy_terms. Added aspiration (2026-05-07) for "open to grow into" career interests.';

-- ─── 2. Enable RLS on talent_profile_taxonomy ──────────────────────────────

ALTER TABLE public.talent_profile_taxonomy ENABLE ROW LEVEL SECURITY;

-- ─── 3. Policies ──────────────────────────────────────────────────────────

-- Drop existing policies (idempotent re-run safety) before recreating.
DROP POLICY IF EXISTS tpt_talent_self_select ON public.talent_profile_taxonomy;
DROP POLICY IF EXISTS tpt_talent_self_modify ON public.talent_profile_taxonomy;
DROP POLICY IF EXISTS tpt_agency_roster_all ON public.talent_profile_taxonomy;

-- Talent reads their own rows.
CREATE POLICY tpt_talent_self_select ON public.talent_profile_taxonomy
  FOR SELECT
  USING (
    talent_profile_id IN (
      SELECT id FROM public.talent_profiles WHERE user_id = auth.uid()
    )
  );

-- Talent modifies their own rows (insert/update/delete via WITH CHECK).
CREATE POLICY tpt_talent_self_modify ON public.talent_profile_taxonomy
  FOR ALL
  USING (
    talent_profile_id IN (
      SELECT id FROM public.talent_profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    talent_profile_id IN (
      SELECT id FROM public.talent_profiles WHERE user_id = auth.uid()
    )
  );

-- Agency staff (any role on agency_team_members) can manage rows for any
-- talent on their roster. Uses agency_talent_roster as the link.
CREATE POLICY tpt_agency_roster_all ON public.talent_profile_taxonomy
  FOR ALL
  USING (
    talent_profile_id IN (
      SELECT atr.talent_profile_id
      FROM public.agency_talent_roster atr
      JOIN public.agency_memberships atm ON atm.tenant_id = atr.tenant_id
      WHERE atm.profile_id = auth.uid()
        AND atm.status = 'active'
        AND atr.status IN ('active', 'pending')
    )
  )
  WITH CHECK (
    talent_profile_id IN (
      SELECT atr.talent_profile_id
      FROM public.agency_talent_roster atr
      JOIN public.agency_memberships atm ON atm.tenant_id = atr.tenant_id
      WHERE atm.profile_id = auth.uid()
        AND atm.status = 'active'
        AND atr.status IN ('active', 'pending')
    )
  );

-- Note: service_role automatically bypasses RLS. Server actions running
-- with service-role credentials (the requireStaffTenantAction helper)
-- bypass these policies for admin-side operations.

COMMENT ON POLICY tpt_talent_self_select ON public.talent_profile_taxonomy IS
  'Talent reads only their own profile_taxonomy rows.';
COMMENT ON POLICY tpt_talent_self_modify ON public.talent_profile_taxonomy IS
  'Talent modifies only their own profile_taxonomy rows. Trigger trg_enforce_talent_skill_caps still applies.';
COMMENT ON POLICY tpt_agency_roster_all ON public.talent_profile_taxonomy IS
  'Agency team members manage rows for talent on their roster (status active/pending).';

-- ─── Final assertion ───────────────────────────────────────────────────────

DO $$
DECLARE
  v_policy_count INT;
  v_check_includes_aspiration BOOL;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'talent_profile_taxonomy';

  IF v_policy_count < 3 THEN
    RAISE EXCEPTION 'aspiration_and_rls_v1: expected ≥3 RLS policies, got %', v_policy_count;
  END IF;

  SELECT pg_get_constraintdef(oid) LIKE '%aspiration%' INTO v_check_includes_aspiration
  FROM pg_constraint
  WHERE conname = 'talent_profile_taxonomy_relationship_type_check';

  IF NOT COALESCE(v_check_includes_aspiration, false) THEN
    RAISE EXCEPTION 'aspiration_and_rls_v1: aspiration not in relationship_type CHECK.';
  END IF;

  RAISE NOTICE 'aspiration_and_rls_v1: % policies + aspiration enum installed.', v_policy_count;
END $$;

COMMIT;
