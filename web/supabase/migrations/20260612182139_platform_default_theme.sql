-- Platform-wide DEFAULT THEME (Site Default) — stored on the platform_settings
-- singleton (id = true). This is the "Modern 2026" theme that EVERY new tenant
-- + new talent page inherits. A super-admin edits it in Builder Lab → Site
-- Defaults; the write goes through the service-role server action (RLS-bypass),
-- so no UPDATE policy is exposed (mirrors operating_currency / commercial cols).
--
-- The platform_settings table is the singleton created by
-- 20261016074300_platform_settings_operating_currency.sql (id boolean PK,
-- check id is true). We only ADD columns here + seed the row — never recreate it.

alter table public.platform_settings
  add column if not exists default_theme_tokens jsonb,
  add column if not exists default_component_styles jsonb,
  add column if not exists default_theme_preset_slug text,
  add column if not exists default_theme_updated_at timestamptz,
  add column if not exists default_theme_updated_by uuid;

-- Ensure the singleton row exists (idempotent — created by the currency migration
-- in normal history order, but guard in case this lands first on a fresh DB).
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

-- Seed the singleton with the Modern 2026 default (clean light + sky-blue accent).
-- Kept in sync with `modernPreset` in
-- src/lib/site-admin/presets/theme-presets.ts (the code-side fallback). Only seeds
-- when the column is still empty, so re-running never clobbers a super-admin edit.
update public.platform_settings
set
  default_theme_preset_slug = 'modern-2026',
  default_theme_tokens = '{
    "color.background": "#ffffff",
    "color.ink": "#111111",
    "color.primary": "#111111",
    "color.secondary": "#6b7280",
    "color.accent": "#0ea5e9",
    "color.neutral": "#737373",
    "color.line": "#e5e7eb",
    "color.surface-raised": "#ffffff",
    "color.muted": "#6b7280",
    "background.mode": "plain",
    "radius.scale-preset": "soft",
    "shadow.preset": "soft",
    "spacing.scale": "cozy",
    "typography.heading-preset": "sans",
    "typography.body-preset": "sans",
    "typography.scale-preset": "standard",
    "motion.preset": "snappy"
  }'::jsonb,
  default_component_styles = '{
    "heading": { "textColor": "token:color.ink" },
    "paragraph": { "textColor": "token:color.muted" },
    "button": { "backgroundColor": "token:color.accent", "textColor": "#ffffff", "borderRadius": "10px" },
    "card": { "backgroundColor": "token:color.surface-raised", "borderColor": "token:color.line" }
  }'::jsonb,
  default_theme_updated_at = now()
where id = true
  and default_theme_tokens is null;
