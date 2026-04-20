-- SaaS Phase 1 / P1.A.8 — public.agency_client_relationships (tenant ↔ client overlay)
--                          + backfill existing client_profiles onto tenant #1.
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §4,
--      docs/saas/phase-1/o1-o7-resolutions.md O6 (global client + overlay default),
--      Plan §4 (Ownership Model).
--
-- Mirrors the canonical+overlay pattern used for talent. client_profiles stays
-- global. Per-agency notes, tags, status, source live here.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_client_relationships (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES public.agencies(id)         ON DELETE CASCADE,
  client_profile_id       UUID        NOT NULL REFERENCES public.client_profiles(id)  ON DELETE CASCADE,
  source_type             TEXT        NOT NULL DEFAULT 'legacy'
                                        CHECK (source_type IN (
                                          'inquiry','direct','imported','referral','legacy'
                                        )),
  status                  TEXT        NOT NULL DEFAULT 'active'
                                        CHECK (status IN ('active','inactive','archived')),
  private_notes           TEXT,
  local_tags              TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],
  first_inquiry_id        UUID        REFERENCES public.inquiries(id) ON DELETE SET NULL,
  last_interaction_at     TIMESTAMPTZ,
  added_by                UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agency_client_relationships IS
  'Per-tenant relationship overlay on canonical client_profiles (O6 default). Private notes, tags, source stay here; identity + contact info stay in client_profiles. Capability view_private_client_data gates reads of sensitive columns (Phase 2).';

CREATE UNIQUE INDEX IF NOT EXISTS agency_client_relationships_tenant_client_uniq
  ON public.agency_client_relationships (tenant_id, client_profile_id);

CREATE INDEX IF NOT EXISTS agency_client_relationships_tenant_idx
  ON public.agency_client_relationships (tenant_id);

CREATE INDEX IF NOT EXISTS agency_client_relationships_client_idx
  ON public.agency_client_relationships (client_profile_id);

ALTER TABLE public.agency_client_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_client_relationships_staff_all ON public.agency_client_relationships;
CREATE POLICY agency_client_relationships_staff_all ON public.agency_client_relationships
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

CREATE OR REPLACE FUNCTION public.agency_client_relationships_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_client_relationships_touch_updated_at ON public.agency_client_relationships;
CREATE TRIGGER trg_agency_client_relationships_touch_updated_at
  BEFORE UPDATE ON public.agency_client_relationships
  FOR EACH ROW EXECUTE FUNCTION public.agency_client_relationships_touch_updated_at();

-- Backfill: every existing client_profiles row gets a tenant #1 relationship row.
INSERT INTO public.agency_client_relationships (
  tenant_id, client_profile_id, source_type, status, added_at
)
SELECT
  '00000000-0000-0000-0000-000000000001'::UUID,
  cp.id,
  'legacy',
  'active',
  COALESCE(cp.created_at, now())
FROM public.client_profiles cp
ON CONFLICT DO NOTHING;

COMMIT;
