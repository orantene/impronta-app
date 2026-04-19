-- SaaS Phase 1 / P1.A.7 — public.agency_talent_overlays (agency presentation of talent)
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §4 + §8 (cross-surface
--          serialization contract — this table is load-bearing for L39),
--      Plan §3 (Canonical + Overlay), §24 (Cross-surface leakage),
--      L7 (Agency presentation overrides live here, never on talent_profiles).
--
-- Hub DTOs explicitly exclude every column defined here (deliverable 5 §3).
-- Storefront DTOs include this tenant's overlay only. Admin DTOs see own
-- tenant's overlay. Phase 6 adds agency_field_values for structured local data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_talent_overlays (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL REFERENCES public.agencies(id)        ON DELETE CASCADE,
  talent_profile_id         UUID        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,

  -- Public-facing presentation (rendered on agency storefront, never hub):
  display_headline          TEXT,
  local_bio                 TEXT,
  cover_media_asset_id      UUID        REFERENCES public.media_assets(id) ON DELETE SET NULL,
  portfolio_media_ids       UUID[]      NOT NULL DEFAULT '{}'::UUID[],
  local_tags                TEXT[]      NOT NULL DEFAULT '{}'::TEXT[],

  -- Internal-only (never rendered publicly):
  booking_notes             TEXT,
  availability_notes        TEXT,
  pricing_notes             TEXT,
  internal_score            NUMERIC(5,2),
  sort_override             INTEGER,

  metadata                  JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agency_talent_overlays IS
  'Per-tenant presentation overlay for a canonical talent_profile. L7 + L39: these columns MUST NOT appear in any hub DTO; hub serializer is schema-deny against this table.';

CREATE UNIQUE INDEX IF NOT EXISTS agency_talent_overlays_tenant_talent_uniq
  ON public.agency_talent_overlays (tenant_id, talent_profile_id);

CREATE INDEX IF NOT EXISTS agency_talent_overlays_tenant_idx
  ON public.agency_talent_overlays (tenant_id);

CREATE INDEX IF NOT EXISTS agency_talent_overlays_sort_idx
  ON public.agency_talent_overlays (tenant_id, sort_override)
  WHERE sort_override IS NOT NULL;

ALTER TABLE public.agency_talent_overlays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_talent_overlays_staff_all ON public.agency_talent_overlays;
CREATE POLICY agency_talent_overlays_staff_all ON public.agency_talent_overlays
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

-- Public storefront read of overlay fields tied to site-visible roster rows.
-- Phase 4 storefront middleware + Phase 2 RLS will further restrict to the
-- resolved tenant. Phase 1 all rows belong to tenant #1.
DROP POLICY IF EXISTS agency_talent_overlays_public_select ON public.agency_talent_overlays;
CREATE POLICY agency_talent_overlays_public_select ON public.agency_talent_overlays
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_talent_roster r
      WHERE r.tenant_id = agency_talent_overlays.tenant_id
        AND r.talent_profile_id = agency_talent_overlays.talent_profile_id
        AND r.status = 'active'
        AND r.agency_visibility IN ('site_visible','featured')
    )
  );

CREATE OR REPLACE FUNCTION public.agency_talent_overlays_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_talent_overlays_touch_updated_at ON public.agency_talent_overlays;
CREATE TRIGGER trg_agency_talent_overlays_touch_updated_at
  BEFORE UPDATE ON public.agency_talent_overlays
  FOR EACH ROW EXECUTE FUNCTION public.agency_talent_overlays_touch_updated_at();

-- No backfill: overlays are agency-created post-launch. Canonical talent
-- presentation (until an overlay is authored) is the profile itself.

COMMIT;
