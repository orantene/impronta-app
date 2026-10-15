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

-- 6. Talent personal sites (no business-workspace tenant) ---------------------
-- Talent sites live in talent_sites snapshots, not tenant cms_pages. Their
-- posts are scoped by talent_profile_id; tenant_id stays NULL on those rows.
-- PM decision 2026-10-14 (TUL-1003 comment).

ALTER TABLE public.cms_posts
  ADD COLUMN IF NOT EXISTS talent_profile_id uuid REFERENCES public.talent_profiles (id) ON DELETE CASCADE;
ALTER TABLE public.cms_posts DROP CONSTRAINT IF EXISTS cms_posts_scope_present;
ALTER TABLE public.cms_posts
  ADD CONSTRAINT cms_posts_scope_present
  CHECK (tenant_id IS NOT NULL OR talent_profile_id IS NOT NULL) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS cms_posts_talent_locale_slug_key
  ON public.cms_posts (talent_profile_id, locale, slug)
  WHERE talent_profile_id IS NOT NULL;

ALTER TABLE public.cms_post_categories ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.cms_post_categories
  ADD COLUMN IF NOT EXISTS talent_profile_id uuid REFERENCES public.talent_profiles (id) ON DELETE CASCADE;
ALTER TABLE public.cms_post_categories DROP CONSTRAINT IF EXISTS cms_post_categories_scope_present;
ALTER TABLE public.cms_post_categories
  ADD CONSTRAINT cms_post_categories_scope_present
  CHECK (tenant_id IS NOT NULL OR talent_profile_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS cms_post_categories_talent_locale_slug_key
  ON public.cms_post_categories (talent_profile_id, locale, slug)
  WHERE talent_profile_id IS NOT NULL;

ALTER TABLE public.cms_redirects
  ADD COLUMN IF NOT EXISTS talent_profile_id uuid REFERENCES public.talent_profiles (id) ON DELETE CASCADE;

-- Web Office = any paid talent plan key (talent_portfolio + grandfathered talent_pro).
-- SECURITY DEFINER to read talent_profiles; never executable by anon.
CREATE OR REPLACE FUNCTION public.talent_profile_has_web_office(profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.talent_profiles tp
    WHERE tp.id = profile_id
      AND tp.talent_plan_key IN ('talent_portfolio', 'talent_pro')
  );
$$;
REVOKE ALL ON FUNCTION public.talent_profile_has_web_office(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talent_profile_has_web_office(uuid) TO authenticated, service_role;

-- Owner: full draft access (free talents can draft + preview).
DROP POLICY IF EXISTS cms_posts_talent_owner_all ON public.cms_posts;
CREATE POLICY cms_posts_talent_owner_all ON public.cms_posts
  FOR ALL TO authenticated
  USING (talent_profile_id IS NOT NULL AND public.is_talent_profile_owner(talent_profile_id))
  WITH CHECK (talent_profile_id IS NOT NULL AND public.is_talent_profile_owner(talent_profile_id));

DROP POLICY IF EXISTS cms_post_categories_talent_owner_all ON public.cms_post_categories;
CREATE POLICY cms_post_categories_talent_owner_all ON public.cms_post_categories
  FOR ALL TO authenticated
  USING (talent_profile_id IS NOT NULL AND public.is_talent_profile_owner(talent_profile_id))
  WITH CHECK (talent_profile_id IS NOT NULL AND public.is_talent_profile_owner(talent_profile_id));

DROP POLICY IF EXISTS cms_redirects_talent_owner_all ON public.cms_redirects;
CREATE POLICY cms_redirects_talent_owner_all ON public.cms_redirects
  FOR ALL TO authenticated
  USING (talent_profile_id IS NOT NULL AND public.is_talent_profile_owner(talent_profile_id))
  WITH CHECK (talent_profile_id IS NOT NULL AND public.is_talent_profile_owner(talent_profile_id));

-- Public talent-post reads go through the server (service role) keyed by the
-- resolved talent site, like talent_sites snapshots; no anon policy is added.

-- Paid gate at the DB too: a talent post can only move INTO 'published'
-- (or have its live content edited) while the owner has Web Office.
-- Lapse = live posts stay live (no row is mutated) but become read-only.
CREATE OR REPLACE FUNCTION public.cms_posts_guard_talent_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.talent_profile_id IS NULL
     OR coalesce(auth.role(), '') = 'service_role'
     OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'published'
     AND NOT public.talent_profile_has_web_office(NEW.talent_profile_id) THEN
    RAISE EXCEPTION 'cms_posts: publishing needs Web Office'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cms_posts_guard_talent_publish() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS cms_posts_guard_talent_publish ON public.cms_posts;
CREATE TRIGGER cms_posts_guard_talent_publish
  BEFORE INSERT OR UPDATE ON public.cms_posts
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_posts_guard_talent_publish();

-- 7. Explicit schedule marker. Only rows with scheduled_publish_at set are
-- picked up by the publish-scheduled cron; legacy drafts carrying an old
-- published_at are never auto-published.
ALTER TABLE public.cms_posts
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_cms_posts_scheduled
  ON public.cms_posts (scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL AND status = 'draft';

-- 8. Talent post layout ("Diseño de posts", TUL-1008). Talent sites have no
-- cms_pages, so the layout is one optional jsonb envelope on the site row
-- { kind:'post_layout', v:1, sections:[...] }. NULL = render the article
-- directly. Additive, nullable; no functions. (A column, not the shell/page
-- snapshot JSON: those are BuilderNode trees consumed by the renderer and the
-- publish/history pipeline, so an extra key there would be pruned or rejected.)
ALTER TABLE public.talent_sites
  ADD COLUMN IF NOT EXISTS post_layout jsonb;

-- 9. Tags (Posts widget filters). Free-form, lower-case slugs, max 10 per post.
ALTER TABLE public.cms_posts
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.cms_posts DROP CONSTRAINT IF EXISTS cms_posts_tags_max;
ALTER TABLE public.cms_posts
  ADD CONSTRAINT cms_posts_tags_max CHECK (cardinality(tags) <= 10);
CREATE INDEX IF NOT EXISTS idx_cms_posts_tags ON public.cms_posts USING gin (tags);
