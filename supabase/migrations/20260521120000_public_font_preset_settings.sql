BEGIN;

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
      'public_font_preset'
    )
  );

INSERT INTO public.settings (key, value, updated_at)
VALUES ('public_font_preset', '"impronta"'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

COMMIT;
