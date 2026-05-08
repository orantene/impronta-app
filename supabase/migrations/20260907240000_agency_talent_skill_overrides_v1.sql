-- ============================================================================
-- Agency-Talent Skill Overrides V1 — 2026-05-07 (Phase 7.1)
-- ============================================================================
--
-- WHY
-- ───
-- A talent on Impronta + Agency Y might want different presentation per
-- tenant: different featured skill, different visible skills (hide a
-- skill from one agency's site), or a different proficiency label
-- ("Master" privately, "Pro" publicly to clients of that tenant).
--
-- Per-tenant photo curation already exists (agency_talent_media). This
-- adds the equivalent layer for skills.
--
-- WHAT
-- ────
-- New table agency_talent_skill_overrides — sparse rows. Each override
-- targets one (tenant, talent, skill) tuple and can:
--   - hide the skill from this agency's site (is_visible_on_agency_site=false)
--   - reorder it (display_order_override)
--   - relabel it (custom_label)
--   - flag it as the featured skill for THIS agency (is_featured_for_agency)
--
-- The talent's master proficiency, verification, years stays in
-- talent_profile_taxonomy. This table only customizes the per-tenant view.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_talent_skill_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  taxonomy_term_id UUID NOT NULL REFERENCES public.taxonomy_terms(id) ON DELETE CASCADE,
  is_visible_on_agency_site BOOLEAN NOT NULL DEFAULT true,
  is_featured_for_agency BOOLEAN NOT NULL DEFAULT false,
  display_order_override INT,
  custom_label TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  UNIQUE (tenant_id, talent_profile_id, taxonomy_term_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_overrides_tenant_talent
  ON public.agency_talent_skill_overrides (tenant_id, talent_profile_id);

COMMENT ON TABLE public.agency_talent_skill_overrides IS
  'Per-tenant overrides on a talent skill. Each row is sparse — only override fields populated. Default rendering uses talent_profile_taxonomy directly; this table only customizes for a specific tenant view.';

COMMENT ON COLUMN public.agency_talent_skill_overrides.is_featured_for_agency IS
  'When true, this skill shows as featured on this agency''s branded site, overriding the talent''s global display_order=1 featured choice.';

-- ─── Final assertion ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name='agency_talent_skill_overrides' AND table_schema='public'
  ) THEN
    RAISE EXCEPTION 'skill_overrides_v1: table not created';
  END IF;
  RAISE NOTICE 'skill_overrides_v1: table installed.';
END $$;

COMMIT;
