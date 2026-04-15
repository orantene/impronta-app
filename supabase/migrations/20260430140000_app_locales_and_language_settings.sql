BEGIN;

-- Canonical catalog of site languages (admin + public visibility).
CREATE TABLE public.app_locales (
  code TEXT PRIMARY KEY,
  label_native TEXT NOT NULL,
  label_en TEXT NOT NULL,
  enabled_admin BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_public BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_locale TEXT REFERENCES public.app_locales (code) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_locales_one_default ON public.app_locales ((true))
  WHERE is_default = TRUE;

CREATE INDEX idx_app_locales_sort ON public.app_locales (sort_order, code);

CREATE OR REPLACE FUNCTION public.app_locales_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_locales_touch_updated_at ON public.app_locales;
CREATE TRIGGER app_locales_touch_updated_at
  BEFORE UPDATE ON public.app_locales
  FOR EACH ROW
  EXECUTE PROCEDURE public.app_locales_touch_updated_at();

ALTER TABLE public.app_locales ENABLE ROW LEVEL SECURITY;

-- Public and signed-in users: only locales visible on the public site.
-- Staff: full visibility for admin.
CREATE POLICY app_locales_select_public ON public.app_locales
  FOR SELECT
  TO anon, authenticated
  USING (enabled_public = TRUE OR public.is_agency_staff());

CREATE POLICY app_locales_write_staff ON public.app_locales
  FOR ALL
  TO authenticated
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

INSERT INTO public.app_locales (
  code, label_native, label_en, enabled_admin, enabled_public, sort_order, is_default, fallback_locale
) VALUES
  ('en', 'English', 'English', TRUE, TRUE, 0, TRUE, NULL),
  ('es', 'Español', 'Spanish', TRUE, TRUE, 10, FALSE, 'en')
ON CONFLICT (code) DO NOTHING;

-- Global language behavior (JSON string values in settings.value).
INSERT INTO public.settings (key, value, updated_at)

VALUES
  ('locale_fallback_mode', '"default_then_chain"'::jsonb, now()),
  ('locale_public_switcher_mode', '"both"'::jsonb, now()),
  ('translation_inventory_version', '1'::jsonb, now()),
  ('translation_inventory_refreshed_at', 'null'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- Allow anon to read locale-related settings for public routing / fallback.
DROP POLICY IF EXISTS settings_public_select_frontend ON public.settings;
CREATE POLICY settings_public_select_frontend ON public.settings
  FOR SELECT
  TO anon, authenticated
  USING (
    key IN (
      'contact_email',
      'directory_public',
      'inquiries_open',
      'watermark_enabled',
      'agency_whatsapp_number',
      'dashboard_theme',
      'site_theme',
      'locale_fallback_mode',
      'locale_public_switcher_mode',
      'translation_inventory_version',
      'translation_inventory_refreshed_at'
    )
  );

-- CMS pages: locale must exist in app_locales (replaces en/es-only check).
ALTER TABLE public.cms_pages DROP CONSTRAINT IF EXISTS cms_pages_locale_check;

ALTER TABLE public.cms_pages
  ADD CONSTRAINT cms_pages_locale_fkey
  FOREIGN KEY (locale) REFERENCES public.app_locales (code)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

COMMIT;
