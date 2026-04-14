-- Phase 8.6A: CMS pages + redirects (Site Settings)
-- Public read: published pages; active redirects (for middleware).
-- Writes: agency staff + super_admin via is_agency_staff().

DO $$
BEGIN
  CREATE TYPE public.cms_page_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE public.cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale TEXT NOT NULL DEFAULT 'en',
  slug TEXT NOT NULL,
  template_key TEXT NOT NULL DEFAULT 'standard_page',
  title TEXT NOT NULL,
  status public.cms_page_status NOT NULL DEFAULT 'draft',
  body TEXT NOT NULL DEFAULT '',
  hero JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_title TEXT,
  meta_description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  noindex BOOLEAN NOT NULL DEFAULT FALSE,
  include_in_sitemap BOOLEAN NOT NULL DEFAULT TRUE,
  canonical_url TEXT,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cms_pages_locale_check CHECK (locale IN ('en', 'es')),
  CONSTRAINT cms_pages_slug_nonempty CHECK (char_length(trim(slug)) > 0)
);

CREATE UNIQUE INDEX cms_pages_locale_slug_key ON public.cms_pages (locale, slug);

CREATE INDEX idx_cms_pages_published_locale
  ON public.cms_pages (locale, status)
  WHERE status = 'published';

CREATE TABLE public.cms_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_path TEXT NOT NULL,
  new_path TEXT NOT NULL,
  status_code SMALLINT NOT NULL DEFAULT 301,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cms_redirects_status_code_check CHECK (status_code IN (301, 302)),
  CONSTRAINT cms_redirects_old_starts_slash CHECK (old_path LIKE '/%'),
  CONSTRAINT cms_redirects_new_starts_slash CHECK (new_path LIKE '/%'),
  CONSTRAINT cms_redirects_paths_different CHECK (old_path <> new_path)
);

CREATE UNIQUE INDEX cms_redirects_old_path_active_key
  ON public.cms_redirects (old_path)
  WHERE active = true;

CREATE OR REPLACE FUNCTION public.cms_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cms_pages_touch_updated_at
  BEFORE UPDATE ON public.cms_pages
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_touch_updated_at();

CREATE TRIGGER cms_redirects_touch_updated_at
  BEFORE UPDATE ON public.cms_redirects
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_touch_updated_at();

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_redirects ENABLE ROW LEVEL SECURITY;

-- Published pages: world-readable
CREATE POLICY cms_pages_select_published ON public.cms_pages
  FOR SELECT
  USING (status = 'published');

-- Staff: full CRUD + read drafts
CREATE POLICY cms_pages_staff_all ON public.cms_pages
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- Active redirects: readable for redirect resolution (anon + authenticated)
CREATE POLICY cms_redirects_select_active ON public.cms_redirects
  FOR SELECT
  USING (active = true);

CREATE POLICY cms_redirects_staff_all ON public.cms_redirects
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

COMMENT ON TABLE public.cms_pages IS 'Site Settings CMS pages (Phase 8.6A). Public URL prefix /p/{slug} (see web lib/cms/paths).';
COMMENT ON TABLE public.cms_redirects IS 'HTTP redirects; old_path matches request pathname (e.g. /p/old-slug or /es/p/old-slug).';
