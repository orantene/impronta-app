-- Builder Template Registry — WS2
-- ============================================================================
-- Creates the public.builder_templates + public.builder_template_revisions
-- tables that back the Platform Builder Lab template gallery.
--
-- Payload is always freeform `builder_tree` JSONB — never slots.
-- RLS: authenticated users can read published templates; super_admin can
-- write / manage the full lifecycle.
--
-- DRIFT NOTE: `is_super_admin()` is a NEW helper introduced here. The
-- codebase already ships `public.is_platform_admin()` which performs the
-- identical check (profiles.app_role = 'super_admin'). We define
-- `is_super_admin()` as a thin alias so plan references in §B remain
-- accurate and future code can call either name.
-- ============================================================================

BEGIN;

-- ── 0. is_super_admin() helper ───────────────────────────────────────────────
-- Alias of the pre-existing is_platform_admin() — same SELECT, same guard.
-- SECURITY DEFINER + search_path = public mirrors the existing helper exactly.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.app_role = 'super_admin'
  );
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Returns true iff the current auth.uid() belongs to a profiles row with app_role = ''super_admin''. Mirrors public.is_platform_admin(); introduced for the builder template registry (WS2).';

-- ── 1. Enums ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE TYPE public.builder_template_kind AS ENUM (
    'element',
    'section',
    'connected',
    'page_template',
    'starter_kit'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.builder_template_status AS ENUM (
    'draft',
    'in_review',
    'published',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.builder_template_target AS ENUM (
    'talent',
    'workspace',
    'both',
    'platform'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- ── 2. builder_templates ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.builder_templates (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                       public.builder_template_kind    NOT NULL,
  status                     public.builder_template_status  NOT NULL DEFAULT 'draft',
  target_context             public.builder_template_target  NOT NULL DEFAULT 'both',
  title                      text    NOT NULL,
  slug                       text    NOT NULL,
  description                text,
  category                   text    NOT NULL,   -- maps to AddGalleryCategoryDef.id
  gallery_tab                text    NOT NULL,   -- sections|elements|connected|page_templates
  tags                       text[]  NOT NULL DEFAULT '{}',
  thumbnail_asset_id         uuid    REFERENCES public.media_assets(id) ON DELETE SET NULL,
  hero_asset_id              uuid    REFERENCES public.media_assets(id) ON DELETE SET NULL,
  required_plan              text    NOT NULL DEFAULT 'free',   -- free|studio|agency|network
  required_talent_tier       text,                              -- null|talent_basic|talent_pro|talent_portfolio
  builder_tree               jsonb   NOT NULL DEFAULT '[]'::jsonb,
  theme_tokens               jsonb,
  data_binding_requirements  jsonb   NOT NULL DEFAULT '[]'::jsonb,  -- BuilderDataSourceKey[]
  schema_version             integer NOT NULL DEFAULT 1,
  version                    integer NOT NULL DEFAULT 1,
  published_at               timestamptz,
  source_tenant_id           uuid    REFERENCES public.agencies(id)  ON DELETE SET NULL,
  created_by                 uuid    REFERENCES public.profiles(id)  ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);

-- Constraints
ALTER TABLE public.builder_templates
  DROP CONSTRAINT IF EXISTS builder_templates_gallery_tab_check;
ALTER TABLE public.builder_templates
  ADD CONSTRAINT builder_templates_gallery_tab_check
  CHECK (gallery_tab IN ('sections', 'elements', 'connected', 'page_templates'));

ALTER TABLE public.builder_templates
  DROP CONSTRAINT IF EXISTS builder_templates_required_plan_check;
ALTER TABLE public.builder_templates
  ADD CONSTRAINT builder_templates_required_plan_check
  CHECK (required_plan IN ('free', 'studio', 'agency', 'network'));

ALTER TABLE public.builder_templates
  DROP CONSTRAINT IF EXISTS builder_templates_version_positive;
ALTER TABLE public.builder_templates
  ADD CONSTRAINT builder_templates_version_positive
  CHECK (version >= 1);

-- Indexes
CREATE INDEX IF NOT EXISTS builder_templates_status_target_idx
  ON public.builder_templates (status, target_context);

CREATE INDEX IF NOT EXISTS builder_templates_gallery_tab_idx
  ON public.builder_templates (gallery_tab, status)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS builder_templates_kind_slug_idx
  ON public.builder_templates (kind, slug);

-- updated_at trigger (uses the same pattern as other tables in this repo)
CREATE OR REPLACE FUNCTION public.builder_templates_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS builder_templates_updated_at ON public.builder_templates;
CREATE TRIGGER builder_templates_updated_at
  BEFORE UPDATE ON public.builder_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.builder_templates_set_updated_at();

-- Comments
COMMENT ON TABLE  public.builder_templates                    IS 'Platform-level freeform builder template registry. Payload is always builder_tree JSONB; never composition slots.';
COMMENT ON COLUMN public.builder_templates.kind               IS 'Discriminator: element | section | connected | page_template | starter_kit';
COMMENT ON COLUMN public.builder_templates.status             IS 'Lifecycle status: draft → in_review → published; can also be archived.';
COMMENT ON COLUMN public.builder_templates.target_context     IS 'Which builder surface the template targets: talent | workspace | both | platform.';
COMMENT ON COLUMN public.builder_templates.gallery_tab        IS 'Which Add Gallery tab this template appears on: sections|elements|connected|page_templates.';
COMMENT ON COLUMN public.builder_templates.required_plan      IS 'Minimum workspace plan required to insert this template: free|studio|agency|network.';
COMMENT ON COLUMN public.builder_templates.required_talent_tier IS 'If set, limits to talent tiers: talent_basic|talent_pro|talent_portfolio.';
COMMENT ON COLUMN public.builder_templates.builder_tree       IS 'Freeform BuilderNode[] subtree (element/section) or full tree (page_template). Re-minted ids on every insert.';
COMMENT ON COLUMN public.builder_templates.data_binding_requirements IS 'BuilderDataSourceKey[] computed by walking builder_tree on save.';
COMMENT ON COLUMN public.builder_templates.version            IS 'Monotonically increasing version; bumped on every publishTemplate call.';
COMMENT ON COLUMN public.builder_templates.source_tenant_id   IS 'Optional: the agency workspace that donated this template (attribution).';

-- ── 3. builder_template_revisions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.builder_template_revisions (
  id           uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid     NOT NULL REFERENCES public.builder_templates(id) ON DELETE CASCADE,
  version      integer  NOT NULL,
  status       public.builder_template_status NOT NULL,
  snapshot     jsonb    NOT NULL,   -- full builder_templates row snapshot at publish time
  note         text,
  created_by   uuid     REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS builder_template_revisions_template_version_idx
  ON public.builder_template_revisions (template_id, version DESC);

COMMENT ON TABLE  public.builder_template_revisions             IS 'Immutable revision history for builder_templates. One row per publishTemplate call. Mirrors the structure of cms_page_revisions.';
COMMENT ON COLUMN public.builder_template_revisions.snapshot    IS 'Full builder_templates row JSONB at the moment of publish. Used by restoreTemplateRevision.';
COMMENT ON COLUMN public.builder_template_revisions.version     IS 'Matches the version on builder_templates at the time of publication.';

-- ── 4. RLS — builder_templates ───────────────────────────────────────────────

ALTER TABLE public.builder_templates ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read published templates
DROP POLICY IF EXISTS bt_select_published ON public.builder_templates;
CREATE POLICY bt_select_published ON public.builder_templates
  FOR SELECT
  TO authenticated
  USING (status = 'published');

-- super_admin can read any template (all statuses)
DROP POLICY IF EXISTS bt_select_super_admin ON public.builder_templates;
CREATE POLICY bt_select_super_admin ON public.builder_templates
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- super_admin full write (INSERT / UPDATE / DELETE)
DROP POLICY IF EXISTS bt_write_super_admin ON public.builder_templates;
CREATE POLICY bt_write_super_admin ON public.builder_templates
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── 5. RLS — builder_template_revisions ──────────────────────────────────────

ALTER TABLE public.builder_template_revisions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read revisions for published templates
DROP POLICY IF EXISTS btr_select_published ON public.builder_template_revisions;
CREATE POLICY btr_select_published ON public.builder_template_revisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.builder_templates t
      WHERE t.id = builder_template_revisions.template_id
        AND t.status = 'published'
    )
  );

-- super_admin can read ALL revisions
DROP POLICY IF EXISTS btr_select_super_admin ON public.builder_template_revisions;
CREATE POLICY btr_select_super_admin ON public.builder_template_revisions
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

-- super_admin full write
DROP POLICY IF EXISTS btr_write_super_admin ON public.builder_template_revisions;
CREATE POLICY btr_write_super_admin ON public.builder_template_revisions
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMIT;
