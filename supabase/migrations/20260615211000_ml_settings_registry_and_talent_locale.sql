-- Multi-Language Platform — WS2: registry-sourced settings + talent locale preference.
--
-- Ref: web/docs/multi-language-platform-execution-plan-2026-06-15.md  (§0.1, R1, R3)
--
-- Two independent changes, both pre-launch / aggressive (no dual-read window):
--
--   1. RELAX agency_business_identity locale gating.
--      The en/es-only CHECK constraints added in
--      20260620110000_saas_p5_m1_identity_extensions.sql hard-rejected any third
--      locale. The platform locale universe is now the `app_locales` registry
--      (platform-admin managed) + app-layer validation (localeSchema /
--      supportedLocalesSchema + the registry-membership check in
--      updateWorkspaceFields). We DROP the two `*_platform_allowed` CHECKs so a
--      registry-defined locale (e.g. "fr", "pt-BR") is accepted.
--
--      KEPT (still correct, registry-agnostic):
--        - agency_business_identity_supported_locales_nonempty
--        - agency_business_identity_default_in_supported   <- "default in supported"
--
--   2. ADD a TALENT-tier locale preference.
--      `talent_profiles.preferred_locale` (nullable; NULL = inherit the agency
--      default). Per R1 this governs the talent's OWN dashboard + the default
--      language of their public talent page, constrained at resolve time to the
--      agency's supportedLocales (see web/src/lib/site-admin/server/talent-locale.ts).
--
-- Idempotent: guarded DROPs (DROP CONSTRAINT IF EXISTS) + ADD COLUMN IF NOT EXISTS.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop the en/es-only platform-allow-list CHECKs on agency_business_identity
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_business_identity
  DROP CONSTRAINT IF EXISTS agency_business_identity_supported_locales_platform_allowed;

ALTER TABLE public.agency_business_identity
  DROP CONSTRAINT IF EXISTS agency_business_identity_default_locale_platform_allowed;

COMMENT ON COLUMN public.agency_business_identity.supported_locales IS
  'Locales this tenant publishes. Non-empty. Allowed set is governed by the app_locales registry + app-layer validation (no DB enum gate). Storefront falls back to default_locale for supported-but-missing locales.';

COMMENT ON COLUMN public.agency_business_identity.default_locale IS
  'Default (PRIMARY) locale for this tenant. Must be in supported_locales (DB CHECK). Allowed set governed by the app_locales registry + app-layer validation.';

-- ---------------------------------------------------------------------------
-- 2. Talent-tier locale preference
-- ---------------------------------------------------------------------------

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT;

COMMENT ON COLUMN public.talent_profiles.preferred_locale IS
  'WS2/R1. Talent self-selected preferred language (BCP-47, e.g. "en", "es", "pt-BR"). NULL = inherit the agency default. Governs the talent''s own dashboard + the default language of their public talent page, constrained at resolve time to the agency''s supported_locales (web/src/lib/site-admin/server/talent-locale.ts).';

COMMIT;
