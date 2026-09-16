-- 20260916000356_platform_stock_and_site_looks.sql
--
-- Templates & Imagery program (docs/plans/templates/01-plan.md), the one
-- migration for the program (D-TPL-8, D-TPL-12). ADDITIVE ONLY: two new
-- tables, no change to any existing column, so it is safe to apply before the
-- code that reads it ships.
--
-- 1. platform_stock_images — the manifest of the lifestyle stock library.
--    Image BYTES stay where platform stock already lives: `media_assets` rows
--    under the `tulala` tenant (lib/media/platform-stock.ts). This table adds
--    what that design lacked: business type × role, licence, prompt/supplier,
--    palette hint, alt text in ES and EN, and a soft retire. Rows belong to no
--    tenant, so stock never counts against a tenant's media cap (D-TPL-3/6).
--
-- 2. site_looks — one Look = one row = one JSON (D-TPL-5). Built-ins are
--    authored in code and synced here; imported/authored Looks live only here.

-- ── 1. platform_stock_images ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_stock_images (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       uuid NOT NULL UNIQUE REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  -- NULL = a family-level pack (the fallback for every type in the family).
  business_type  text,
  family         text NOT NULL,
  role           text NOT NULL,
  source         text NOT NULL,
  licence        text NOT NULL,
  prompt         text,
  supplier       text,
  palette_hint   text,
  alt_es         text NOT NULL,
  alt_en         text NOT NULL,
  sort_order     integer NOT NULL DEFAULT 0,
  retired_at     timestamptz,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_stock_images_role_check
    CHECK (role IN ('hero', 'wide', 'portrait', 'gallery', 'team', 'detail')),
  CONSTRAINT platform_stock_images_source_check
    CHECK (source IN ('generated', 'licensed')),
  CONSTRAINT platform_stock_images_family_check
    CHECK (family IN ('dining','beauty','wellness','fitness','events','agency','professional','education','hospitality','craft','tours','custom'))
);

CREATE INDEX IF NOT EXISTS platform_stock_images_live_idx
  ON public.platform_stock_images (family, business_type, role, sort_order)
  WHERE retired_at IS NULL;

COMMENT ON TABLE  public.platform_stock_images IS 'Lifestyle stock manifest: business type × role over media_assets rows owned by the tulala tenant. Soft-retired rows keep their object so published pages never break.';
COMMENT ON COLUMN public.platform_stock_images.business_type IS 'business-types.ts id, or NULL for the family-level pack.';
COMMENT ON COLUMN public.platform_stock_images.role IS 'hero | wide | portrait | gallery | team | detail — the Look image slot roles.';
COMMENT ON COLUMN public.platform_stock_images.source IS 'generated (AI, see prompt) | licensed (see supplier + licence).';

CREATE OR REPLACE FUNCTION public.platform_stock_images_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_stock_images_updated_at ON public.platform_stock_images;
CREATE TRIGGER platform_stock_images_updated_at
  BEFORE UPDATE ON public.platform_stock_images
  FOR EACH ROW EXECUTE FUNCTION public.platform_stock_images_set_updated_at();

ALTER TABLE public.platform_stock_images ENABLE ROW LEVEL SECURITY;

-- Every signed-in user may READ live rows (the tenant Media page and the
-- composer read through the service role anyway; this keeps a direct read
-- honest). Writes are platform-admin only, through server actions.
DROP POLICY IF EXISTS platform_stock_images_read ON public.platform_stock_images;
CREATE POLICY platform_stock_images_read
  ON public.platform_stock_images FOR SELECT
  TO authenticated
  USING (retired_at IS NULL OR public.is_super_admin());

DROP POLICY IF EXISTS platform_stock_images_admin_write ON public.platform_stock_images;
CREATE POLICY platform_stock_images_admin_write
  ON public.platform_stock_images FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── 2. site_looks ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_looks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title_es     text NOT NULL,
  title_en     text NOT NULL,
  axis_es      text NOT NULL DEFAULT '',
  axis_en      text NOT NULL DEFAULT '',
  theme_patch  jsonb NOT NULL DEFAULT '{}'::jsonb,
  shell        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { header: BuilderNode[], footer: BuilderNode[] }
  pages        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { home, catalogue, transaction, about, contact, gallery }
  copy         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { key: { es, en } }
  source       text NOT NULL DEFAULT 'imported',
  status       text NOT NULL DEFAULT 'draft',
  version      integer NOT NULL DEFAULT 1,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_looks_source_check CHECK (source IN ('builtin', 'imported', 'authored')),
  CONSTRAINT site_looks_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT site_looks_version_positive CHECK (version >= 1)
);

COMMENT ON TABLE public.site_looks IS 'Site-wide Looks (Layer 1): shell + six page trees + theme patch + copy, one row per Look. Built-ins are synced from code; imported Looks come through the Builder Lab.';

DROP TRIGGER IF EXISTS site_looks_updated_at ON public.site_looks;
CREATE TRIGGER site_looks_updated_at
  BEFORE UPDATE ON public.site_looks
  FOR EACH ROW EXECUTE FUNCTION public.platform_stock_images_set_updated_at();

ALTER TABLE public.site_looks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_looks_read ON public.site_looks;
CREATE POLICY site_looks_read
  ON public.site_looks FOR SELECT
  TO authenticated
  USING (status = 'published' OR public.is_super_admin());

DROP POLICY IF EXISTS site_looks_admin_write ON public.site_looks;
CREATE POLICY site_looks_admin_write
  ON public.site_looks FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
