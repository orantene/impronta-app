-- Chunk 2: CMS posts + navigation (8.5/8.6). Reuses cms_page_status enum.
-- Public read: published posts; staff: full CRUD.

CREATE TABLE public.cms_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale TEXT NOT NULL DEFAULT 'en',
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status public.cms_page_status NOT NULL DEFAULT 'draft',
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  noindex BOOLEAN NOT NULL DEFAULT FALSE,
  include_in_sitemap BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cms_posts_locale_check CHECK (locale IN ('en', 'es')),
  CONSTRAINT cms_posts_slug_nonempty CHECK (char_length(trim(slug)) > 0)
);

CREATE UNIQUE INDEX cms_posts_locale_slug_key ON public.cms_posts (locale, slug);

CREATE INDEX idx_cms_posts_published_locale
  ON public.cms_posts (locale, status)
  WHERE status = 'published';

CREATE TRIGGER cms_posts_touch_updated_at
  BEFORE UPDATE ON public.cms_posts
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_touch_updated_at();

ALTER TABLE public.cms_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cms_posts_select_published ON public.cms_posts
  FOR SELECT
  USING (status = 'published');

CREATE POLICY cms_posts_staff_all ON public.cms_posts
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

COMMENT ON TABLE public.cms_posts IS 'Editorial/blog posts (8.6). Public URLs /posts/{slug} and /es/posts/{slug}.';

-- Header/footer navigation rows (managed in Site Settings).
CREATE TABLE public.cms_navigation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale TEXT NOT NULL DEFAULT 'en',
  zone TEXT NOT NULL,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cms_navigation_items_locale_check CHECK (locale IN ('en', 'es')),
  CONSTRAINT cms_navigation_items_zone_check CHECK (zone IN ('header', 'footer')),
  CONSTRAINT cms_navigation_items_label_nonempty CHECK (char_length(trim(label)) > 0),
  CONSTRAINT cms_navigation_items_href_nonempty CHECK (char_length(trim(href)) > 0)
);

CREATE INDEX idx_cms_navigation_items_locale_zone
  ON public.cms_navigation_items (locale, zone, sort_order);

CREATE TRIGGER cms_navigation_items_touch_updated_at
  BEFORE UPDATE ON public.cms_navigation_items
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_touch_updated_at();

ALTER TABLE public.cms_navigation_items ENABLE ROW LEVEL SECURITY;

-- Public layout may read visible items; staff manage all.
CREATE POLICY cms_navigation_items_select_visible ON public.cms_navigation_items
  FOR SELECT
  USING (visible = true);

CREATE POLICY cms_navigation_items_staff_all ON public.cms_navigation_items
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

COMMENT ON TABLE public.cms_navigation_items IS 'CMS header/footer links per locale (8.6).';
