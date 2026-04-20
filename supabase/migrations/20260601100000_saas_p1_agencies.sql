-- SaaS Phase 1 / P1.A.1 — public.agencies (tenant record) + tenant #1 seed.
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §4,
--      docs/saas/phase-0/03-state-machines.md §1 (agency lifecycle),
--      docs/saas/phase-1/migration-plan.md P1.A.1,
--      Plan §4 (Ownership Model), §19 (Provisioning), L1, L13, L15, L16.
--
-- This is the foundation row every tenantised table FKs to in Phase 1.B.
-- Tenant #1 UUID = '00000000-0000-0000-0000-000000000001' (L13 — matches
-- existing DEFAULT_AI_TENANT_ID so AI tables don't need re-seeding).
-- Slug 'impronta' per docs/saas/phase-1/o1-o7-resolutions.md O2 default.
--
-- Additive only (L18). No RLS on existing tables changed — that's Phase 2.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agencies (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                        TEXT        NOT NULL UNIQUE,
  display_name                TEXT        NOT NULL,
  status                      TEXT        NOT NULL DEFAULT 'onboarding'
                                            CHECK (status IN (
                                              'draft','onboarding','trial','active',
                                              'past_due','restricted','suspended',
                                              'cancelled','archived'
                                            )),
  template_key                TEXT        NOT NULL DEFAULT 'default',
  supported_locales           TEXT[]      NOT NULL DEFAULT ARRAY['en']::TEXT[],
  settings                    JSONB       NOT NULL DEFAULT '{}'::JSONB,
  onboarding_completed_at     TIMESTAMPTZ,
  suspended_at                TIMESTAMPTZ,
  suspended_reason            TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agencies IS
  'Tenant root. One row per agency; lifecycle status drives storefront/admin/inquiries/billing gates (deliverable 3 §1). L13: tenant #1 id = 00000000-0000-0000-0000-000000000001.';

COMMENT ON COLUMN public.agencies.settings IS
  'Small JSONB for per-agency config that doesn''t warrant a column. Larger structured settings live in public.settings with tenant_id = this.id.';

CREATE INDEX IF NOT EXISTS agencies_status_idx
  ON public.agencies (status)
  WHERE status NOT IN ('cancelled','archived');

-- Seed tenant #1 (L13). Idempotent.
INSERT INTO public.agencies (
  id, slug, display_name, status, template_key, supported_locales,
  onboarding_completed_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  'impronta',
  'Impronta Models Tulum',
  'active',
  'default',
  ARRAY['en','es']::TEXT[],
  now()
)
ON CONFLICT (id) DO UPDATE
  SET display_name      = EXCLUDED.display_name,
      status            = EXCLUDED.status,
      supported_locales = EXCLUDED.supported_locales,
      updated_at        = now();

-- RLS — Phase 1 places the staff-all pattern used throughout this codebase.
-- Phase 2 replaces with tenant-scoped policies keyed on agency_memberships.
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agencies_staff_all ON public.agencies;
CREATE POLICY agencies_staff_all ON public.agencies
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

-- updated_at autoupdate trigger (matches repo convention for timestamped tables).
CREATE OR REPLACE FUNCTION public.agencies_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agencies_touch_updated_at ON public.agencies;
CREATE TRIGGER trg_agencies_touch_updated_at
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agencies_touch_updated_at();

COMMIT;
