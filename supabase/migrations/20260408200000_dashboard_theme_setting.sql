BEGIN;
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
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
      'site_theme'
    )
  );
INSERT INTO public.settings (key, value, updated_at)
VALUES ('dashboard_theme', '"light"'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.settings (key, value, updated_at)
VALUES ('site_theme', '"dark"'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
COMMIT;
