-- Per-surface platform default themes (Builder Lab → Site Defaults split).
--
-- The existing default_theme_* columns remain the SHARED / AGENCY default (every
-- new tenant/workspace inherits it via provisioning — unchanged). This adds an
-- optional TALENT override: talent pages read the talent columns and fall back
-- to the shared default when the override is unset, so there is NO behaviour
-- change until a super-admin sets a talent-specific default.
alter table public.platform_settings
  add column if not exists default_theme_tokens_talent jsonb,
  add column if not exists default_component_styles_talent jsonb,
  add column if not exists default_theme_preset_slug_talent text;

comment on column public.platform_settings.default_theme_tokens_talent is
  'Talent-page default theme tokens (Builder Lab → Site Defaults → Talent). NULL → falls back to the shared default_theme_tokens.';
comment on column public.platform_settings.default_component_styles_talent is
  'Talent-page default component styles. NULL → falls back to default_component_styles.';
comment on column public.platform_settings.default_theme_preset_slug_talent is
  'Talent-page default theme preset slug. NULL → falls back to default_theme_preset_slug.';
