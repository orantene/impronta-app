-- M7 — theme preset slug column on agency_branding.
--
-- Adds an optional marker that tracks which preset the operator last applied
-- (e.g. 'classic', 'editorial-bridal'). Null for tenants that have never
-- applied a preset — their live behaviour is unchanged.
--
-- This column is metadata only: the renderer consumes `theme_json` for
-- actual tokens. The slug is used in the admin UI to highlight "current
-- preset" and to offer a "re-apply preset" action that resets bundled
-- token values to the preset's defaults without touching operator overrides
-- on orthogonal tokens (e.g. logo URL).

ALTER TABLE public.agency_branding
  ADD COLUMN IF NOT EXISTS theme_preset_slug TEXT NULL;

COMMENT ON COLUMN public.agency_branding.theme_preset_slug IS
  'M7 theme preset marker — which ThemePreset bundle was last applied. Null = custom / never applied. See src/lib/site-admin/presets/theme-presets.ts for the registry.';
