-- SaaS Phase 1 / P1.A.5 — public.agency_branding (colors, logo, fonts)
--                          + tenant #1 default seed.
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §4,
--      docs/saas/phase-0/02-capabilities-and-roles.md §4 (edit_branding),
--      Plan §4 (Ownership Model).
--
-- The existing public.settings 'dashboard_theme' key (from 20260408200000)
-- and 'public_font_preset' (from 20260521120000) are platform-global. This
-- table is per-tenant branding; Phase 3 resolves which wins per surface.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_branding (
  tenant_id              UUID        PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  primary_color          TEXT,
  accent_color           TEXT,
  neutral_color          TEXT,
  logo_media_asset_id    UUID        REFERENCES public.media_assets(id) ON DELETE SET NULL,
  logo_dark_media_asset_id UUID      REFERENCES public.media_assets(id) ON DELETE SET NULL,
  favicon_media_asset_id UUID        REFERENCES public.media_assets(id) ON DELETE SET NULL,
  font_preset            TEXT,
  heading_font           TEXT,
  body_font              TEXT,
  theme_json             JSONB       NOT NULL DEFAULT '{}'::JSONB,
  og_image_media_asset_id UUID       REFERENCES public.media_assets(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agency_branding IS
  'Per-tenant storefront + admin branding. edit_branding capability gates writes. Phase 3 wires which platform-global setting values it inherits vs overrides.';

ALTER TABLE public.agency_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_branding_staff_all ON public.agency_branding;
CREATE POLICY agency_branding_staff_all ON public.agency_branding
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

-- Public read so the storefront + hub can style without authenticated session.
DROP POLICY IF EXISTS agency_branding_public_select ON public.agency_branding;
CREATE POLICY agency_branding_public_select ON public.agency_branding
  FOR SELECT
  USING (TRUE);

CREATE OR REPLACE FUNCTION public.agency_branding_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_branding_touch_updated_at ON public.agency_branding;
CREATE TRIGGER trg_agency_branding_touch_updated_at
  BEFORE UPDATE ON public.agency_branding
  FOR EACH ROW EXECUTE FUNCTION public.agency_branding_touch_updated_at();

-- Seed tenant #1 with empty defaults. Existing global settings continue to
-- drive the theme for now; Phase 3 migrates any per-tenant overrides here.
INSERT INTO public.agency_branding (tenant_id, theme_json)
VALUES ('00000000-0000-0000-0000-000000000001'::UUID, '{}'::JSONB)
ON CONFLICT (tenant_id) DO NOTHING;

COMMIT;
