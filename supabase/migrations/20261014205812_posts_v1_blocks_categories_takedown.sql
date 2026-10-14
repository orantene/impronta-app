-- Posts v1 (TUL-1004). Additive only: writer blocks, categories, takedown,
-- expiry, unlisted, AI-crawler flag. Design: docs/plans/posts-v1-design-2026-10-14.md §3.
-- body_blocks NULL = legacy post; the renderer keeps using `body` TEXT.

-- 1. Categories (tenant + locale scoped) -------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_post_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('en', 'es')),
  slug text NOT NULL CHECK (char_length(trim(slug)) > 0),
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, locale, slug)
);

CREATE INDEX IF NOT EXISTS idx_cms_post_categories_tenant_locale
  ON public.cms_post_categories (tenant_id, locale, position);

DROP TRIGGER IF EXISTS cms_post_categories_touch_updated_at ON public.cms_post_categories;
CREATE TRIGGER cms_post_categories_touch_updated_at
  BEFORE UPDATE ON public.cms_post_categories
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_touch_updated_at();

ALTER TABLE public.cms_post_categories ENABLE ROW LEVEL SECURITY;

-- Same tenant-scoped pattern as cms_posts: public read on the current tenant,
-- staff read, active staff write.
DROP POLICY IF EXISTS cms_post_categories_select_tenant ON public.cms_post_categories;
CREATE POLICY cms_post_categories_select_tenant ON public.cms_post_categories
  FOR SELECT
  USING (
    public.current_tenant_id() IS NOT NULL
    AND tenant_id = public.current_tenant_id()
  );

DROP POLICY IF EXISTS cms_post_categories_staff_read ON public.cms_post_categories;
CREATE POLICY cms_post_categories_staff_read ON public.cms_post_categories
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS cms_post_categories_active_staff_write ON public.cms_post_categories;
CREATE POLICY cms_post_categories_active_staff_write ON public.cms_post_categories
  FOR ALL USING (public.is_active_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_active_staff_of_tenant(tenant_id));

-- 2. cms_posts columns --------------------------------------------------------
ALTER TABLE public.cms_posts
  ADD COLUMN IF NOT EXISTS body_blocks jsonb,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.cms_post_categories (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_offering_id uuid,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_unlisted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_image_alt text,
  ADD COLUMN IF NOT EXISTS author_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS translation_of uuid REFERENCES public.cms_posts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS taken_down_at timestamptz,
  ADD COLUMN IF NOT EXISTS taken_down_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS taken_down_reason text;

ALTER TABLE public.cms_posts
  DROP CONSTRAINT IF EXISTS cms_posts_body_blocks_is_array;
ALTER TABLE public.cms_posts
  ADD CONSTRAINT cms_posts_body_blocks_is_array
  CHECK (body_blocks IS NULL OR jsonb_typeof(body_blocks) = 'array');

CREATE INDEX IF NOT EXISTS idx_cms_posts_category ON public.cms_posts (category_id)
  WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_posts_listable
  ON public.cms_posts (tenant_id, locale, published_at DESC)
  WHERE status = 'published' AND is_unlisted = false AND taken_down_at IS NULL;

-- 3. Takedown guard: only the platform admin may set or clear taken_down_*.
-- Staff writes that touch those columns are rejected. Not SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.cms_posts_guard_takedown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.taken_down_at IS DISTINCT FROM OLD.taken_down_at
      OR NEW.taken_down_by IS DISTINCT FROM OLD.taken_down_by
      OR NEW.taken_down_reason IS DISTINCT FROM OLD.taken_down_reason)
     AND NOT public.is_platform_admin()
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'cms_posts takedown fields are platform-admin only'
      USING ERRCODE = '42501';
  END IF;
  -- A taken-down post cannot be republished by the tenant.
  IF OLD.taken_down_at IS NOT NULL
     AND NEW.taken_down_at IS NOT NULL
     AND NEW.status = 'published'
     AND OLD.status IS DISTINCT FROM 'published'
     AND NOT public.is_platform_admin()
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'cms_posts: taken-down post cannot be republished'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cms_posts_guard_takedown() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS cms_posts_guard_takedown ON public.cms_posts;
CREATE TRIGGER cms_posts_guard_takedown
  BEFORE UPDATE ON public.cms_posts
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_posts_guard_takedown();

-- 4. Public read excludes taken-down posts (unlisted stays readable by link).
DROP POLICY IF EXISTS cms_posts_select_tenant_published ON public.cms_posts;
CREATE POLICY cms_posts_select_tenant_published ON public.cms_posts
  FOR SELECT
  USING (
    status = 'published'
    AND taken_down_at IS NULL
    AND public.current_tenant_id() IS NOT NULL
    AND tenant_id = public.current_tenant_id()
  );

-- 5. "IA puede leer mi sitio" (default ON).
ALTER TABLE public.agency_branding
  ADD COLUMN IF NOT EXISTS ai_crawlers_allowed boolean NOT NULL DEFAULT true;
ALTER TABLE public.talent_sites
  ADD COLUMN IF NOT EXISTS ai_crawlers_allowed boolean NOT NULL DEFAULT true;
