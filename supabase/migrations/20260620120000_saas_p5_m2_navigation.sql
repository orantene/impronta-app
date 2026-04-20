-- Phase 5 / M2 — Navigation: hierarchy + publish snapshot + revisions.
--
-- Scope:
--   1. Extend `cms_navigation_items` with `parent_id` (adjacency tree, max
--      depth 2) and `version` (optimistic concurrency per item).
--   2. New table `cms_navigation_menus` — one row per (tenant, zone, locale)
--      holding the PUBLISHED snapshot as `tree_json`. Storefront reads this.
--   3. New table `cms_navigation_revisions` — append-only snapshots on each
--      publish.
--
-- Draft / published never interleave (guardrail §1.8):
--   - Edits go to `cms_navigation_items` (draft working set).
--   - Public reads MUST go through `cms_navigation_menus` (published only).
--   - The `cms_navigation_items_select_tenant_visible` policy still permits
--     public read for backward compat with the v1 storefront; that path is
--     removed once M5 layouts consume `cms_navigation_menus`.
--
-- Idempotent — safe to re-run; all ALTER/CREATE guarded.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. cms_navigation_items — add parent_id, version, indexes
-- ---------------------------------------------------------------------------

ALTER TABLE public.cms_navigation_items
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.cms_navigation_items(id) ON DELETE CASCADE;

ALTER TABLE public.cms_navigation_items
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Self-reference cannot be to a different tenant. Enforced at app layer for
-- now (server action always scopes by tenant); a future trigger can harden.

-- Depth cap — a parent cannot itself have a parent. Two levels total: root +
-- one child layer. Applied as a trigger (CHECK can't self-reference reliably).
CREATE OR REPLACE FUNCTION public.cms_navigation_items_enforce_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_grandparent UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT parent_id INTO v_grandparent
    FROM public.cms_navigation_items
   WHERE id = NEW.parent_id;

  IF v_grandparent IS NOT NULL THEN
    RAISE EXCEPTION 'cms_navigation_items: depth exceeds 2 — parent_id % is itself nested under %', NEW.parent_id, v_grandparent
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cms_navigation_items_enforce_depth ON public.cms_navigation_items;
CREATE TRIGGER trg_cms_navigation_items_enforce_depth
  BEFORE INSERT OR UPDATE OF parent_id ON public.cms_navigation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.cms_navigation_items_enforce_depth();

-- Query index: (tenant, zone, locale, parent, sort_order) — optimal for
-- loading a menu in tree order within one tenant/zone/locale slice.
CREATE INDEX IF NOT EXISTS idx_cms_navigation_items_tenant_zone_locale_parent
  ON public.cms_navigation_items (tenant_id, zone, locale, parent_id NULLS FIRST, sort_order);

-- ---------------------------------------------------------------------------
-- 2. cms_navigation_menus — published snapshot per (tenant, zone, locale)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cms_navigation_menus (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  zone         TEXT        NOT NULL,
  locale       TEXT        NOT NULL,
  tree_json    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  version      INTEGER     NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ,
  published_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cms_navigation_menus_zone_check CHECK (zone IN ('header', 'footer')),
  CONSTRAINT cms_navigation_menus_locale_check CHECK (locale IN ('en', 'es')),
  CONSTRAINT cms_navigation_menus_tree_is_array CHECK (jsonb_typeof(tree_json) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS cms_navigation_menus_tenant_zone_locale_key
  ON public.cms_navigation_menus (tenant_id, zone, locale);

DROP TRIGGER IF EXISTS trg_cms_navigation_menus_touch_updated_at ON public.cms_navigation_menus;
CREATE TRIGGER trg_cms_navigation_menus_touch_updated_at
  BEFORE UPDATE ON public.cms_navigation_menus
  FOR EACH ROW
  EXECUTE FUNCTION public.cms_touch_updated_at();

ALTER TABLE public.cms_navigation_menus ENABLE ROW LEVEL SECURITY;

-- Staff: full CRUD on their tenant's menu snapshots.
DROP POLICY IF EXISTS cms_navigation_menus_tenant_staff ON public.cms_navigation_menus;
CREATE POLICY cms_navigation_menus_tenant_staff
  ON public.cms_navigation_menus
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- Public: reads the published tree, scoped by current_tenant_id() GUC
-- (set by the middleware + public reader RPC).
DROP POLICY IF EXISTS cms_navigation_menus_public_select ON public.cms_navigation_menus;
CREATE POLICY cms_navigation_menus_public_select
  ON public.cms_navigation_menus
  FOR SELECT
  USING (
    public.current_tenant_id() IS NOT NULL
    AND tenant_id = public.current_tenant_id()
    AND published_at IS NOT NULL
  );

COMMENT ON TABLE public.cms_navigation_menus IS
  'Phase 5 / M2 — published navigation snapshot per (tenant, zone, locale). Atomic publish unit. Storefront reads this; drafts live in cms_navigation_items.';

-- ---------------------------------------------------------------------------
-- 3. cms_navigation_revisions — append-only publish history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cms_navigation_revisions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  zone       TEXT        NOT NULL,
  locale     TEXT        NOT NULL,
  version    INTEGER     NOT NULL,
  snapshot   JSONB       NOT NULL,
  created_by UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cms_navigation_revisions_zone_check CHECK (zone IN ('header', 'footer')),
  CONSTRAINT cms_navigation_revisions_locale_check CHECK (locale IN ('en', 'es')),
  CONSTRAINT cms_navigation_revisions_snapshot_is_array CHECK (jsonb_typeof(snapshot) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_cms_navigation_revisions_tenant_zone_locale_created
  ON public.cms_navigation_revisions (tenant_id, zone, locale, created_at DESC);

COMMENT ON TABLE public.cms_navigation_revisions IS
  'Append-only navigation publish history. One row per publish call; trimmed to 20 most recent per (tenant, zone, locale) by nightly GC.';

ALTER TABLE public.cms_navigation_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cms_navigation_revisions_staff_read ON public.cms_navigation_revisions;
CREATE POLICY cms_navigation_revisions_staff_read
  ON public.cms_navigation_revisions
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_navigation_revisions_staff_insert ON public.cms_navigation_revisions;
CREATE POLICY cms_navigation_revisions_staff_insert
  ON public.cms_navigation_revisions
  FOR INSERT
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- 4. cms_public_navigation_menu_for_tenant — tenant-scoped public reader RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cms_public_navigation_menu_for_tenant(
  p_tenant_id UUID,
  p_zone      TEXT,
  p_locale    TEXT
)
RETURNS public.cms_navigation_menus
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  result public.cms_navigation_menus%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, TRUE);

  SELECT *
    INTO result
    FROM public.cms_navigation_menus
   WHERE tenant_id = p_tenant_id
     AND zone      = p_zone
     AND locale    = p_locale
     AND published_at IS NOT NULL
   LIMIT 1;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.cms_public_navigation_menu_for_tenant IS
  'Tenant-scoped public reader for cms_navigation_menus. Returns the published snapshot (or NULL if none) for the given tenant/zone/locale.';

GRANT EXECUTE ON FUNCTION public.cms_public_navigation_menu_for_tenant(UUID, TEXT, TEXT) TO authenticated, anon;

COMMIT;
