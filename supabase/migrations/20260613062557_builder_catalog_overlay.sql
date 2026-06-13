-- Builder Catalog Overlay + Version — P3 (component control-plane)
-- ============================================================================
-- Two thin tables that make the Builder Lab a control-plane over the "+" Add
-- Gallery, layered on BOTH populations (built-in code items AND published
-- builder_templates):
--
--   public.builder_catalog_overlay  — per-item admin overlay. A row exists ONLY
--     when a super-admin has changed something; absence = code/template default.
--     Keyed by `item_ref` = the AddGalleryItem id ("el-button" for a code item,
--     "db-template:<uuid>" for a published template). Subtract-only visibility
--     (talent_enabled / workspace_enabled) + metadata overrides
--     (label/icon/category) + a tighten-only required_plan_override.
--
--   public.builder_catalog_version  — single-row monotonic counter bumped on any
--     overlay write / template lifecycle change. The sync key (P5): gallery
--     fetches stamp it and refetch when it advances.
--
-- RLS mirrors builder_templates exactly: authenticated users READ (the live
-- galleries + Lab need the overlay to render); super_admin WRITES via
-- is_super_admin(). Writes also go through the service-role client behind the
-- requireSuperAdmin() server gate.
-- ============================================================================

BEGIN;

-- ── 1. builder_catalog_overlay ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.builder_catalog_overlay (
  item_ref                text        PRIMARY KEY,          -- AddGalleryItem.id
  source                  text        NOT NULL,             -- 'code' | 'template'
  talent_enabled          boolean     NOT NULL DEFAULT true,
  workspace_enabled       boolean     NOT NULL DEFAULT true,
  label_override          text,
  icon_override           text,
  category_override       text,
  required_plan_override  text,                             -- free|studio|agency|network (tighten-only, app-enforced)
  availability_override   text,                             -- 'available' | 'hidden'
  updated_by              uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.builder_catalog_overlay
  DROP CONSTRAINT IF EXISTS builder_catalog_overlay_source_check;
ALTER TABLE public.builder_catalog_overlay
  ADD CONSTRAINT builder_catalog_overlay_source_check
  CHECK (source IN ('code', 'template'));

ALTER TABLE public.builder_catalog_overlay
  DROP CONSTRAINT IF EXISTS builder_catalog_overlay_required_plan_check;
ALTER TABLE public.builder_catalog_overlay
  ADD CONSTRAINT builder_catalog_overlay_required_plan_check
  CHECK (required_plan_override IS NULL
         OR required_plan_override IN ('free', 'studio', 'agency', 'network'));

ALTER TABLE public.builder_catalog_overlay
  DROP CONSTRAINT IF EXISTS builder_catalog_overlay_availability_check;
ALTER TABLE public.builder_catalog_overlay
  ADD CONSTRAINT builder_catalog_overlay_availability_check
  CHECK (availability_override IS NULL
         OR availability_override IN ('available', 'hidden'));

CREATE OR REPLACE FUNCTION public.builder_catalog_overlay_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS builder_catalog_overlay_updated_at ON public.builder_catalog_overlay;
CREATE TRIGGER builder_catalog_overlay_updated_at
  BEFORE UPDATE ON public.builder_catalog_overlay
  FOR EACH ROW
  EXECUTE FUNCTION public.builder_catalog_overlay_set_updated_at();

COMMENT ON TABLE public.builder_catalog_overlay IS
  'Per-item admin overlay over the Add Gallery (code items + published templates). A row exists only when changed; absence = default. Subtract-only visibility + metadata overrides.';
COMMENT ON COLUMN public.builder_catalog_overlay.item_ref IS
  'The AddGalleryItem id: a code item id (e.g. "el-button") or "db-template:<uuid>".';
COMMENT ON COLUMN public.builder_catalog_overlay.required_plan_override IS
  'Tighten-only plan gate applied on top of the item base plan (app-enforced; never loosens).';

-- ── 2. builder_catalog_version (single-row counter) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.builder_catalog_version (
  id          integer     PRIMARY KEY DEFAULT 1,
  version     bigint      NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT builder_catalog_version_singleton CHECK (id = 1)
);

INSERT INTO public.builder_catalog_version (id, version)
  VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.builder_catalog_version IS
  'Single-row monotonic counter bumped on any catalog overlay write / template lifecycle change. The "+" gallery sync key (P5).';

-- ── 3. RLS — builder_catalog_overlay ─────────────────────────────────────────

ALTER TABLE public.builder_catalog_overlay ENABLE ROW LEVEL SECURITY;

-- Authenticated users READ (the live galleries + Lab apply the overlay).
DROP POLICY IF EXISTS bco_select_authenticated ON public.builder_catalog_overlay;
CREATE POLICY bco_select_authenticated ON public.builder_catalog_overlay
  FOR SELECT
  TO authenticated
  USING (true);

-- super_admin full write.
DROP POLICY IF EXISTS bco_write_super_admin ON public.builder_catalog_overlay;
CREATE POLICY bco_write_super_admin ON public.builder_catalog_overlay
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── 4. RLS — builder_catalog_version ─────────────────────────────────────────

ALTER TABLE public.builder_catalog_version ENABLE ROW LEVEL SECURITY;

-- Authenticated users READ (gallery fetches stamp the current version).
DROP POLICY IF EXISTS bcv_select_authenticated ON public.builder_catalog_version;
CREATE POLICY bcv_select_authenticated ON public.builder_catalog_version
  FOR SELECT
  TO authenticated
  USING (true);

-- super_admin full write (the bump; also performed via service-role).
DROP POLICY IF EXISTS bcv_write_super_admin ON public.builder_catalog_version;
CREATE POLICY bcv_write_super_admin ON public.builder_catalog_version
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMIT;
