-- Talent-owned languages (PR 1, talent language settings).
-- Additive only: a talent's secondary languages alongside the existing
-- primary (`preferred_locale`). Bounded to platform public locales in the app
-- layer (talent-locale-settings.ts); never contains the primary.
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS secondary_locales text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.talent_profiles.secondary_locales IS
  'Talent secondary languages (ordered). Primary language = preferred_locale (NULL = platform default). Secondary excludes the primary; values bounded to platform public locales by the app.';
