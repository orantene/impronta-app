-- SaaS Phase 5 / M1 — Agency identity + localization + site defaults.
--
-- Ref: /Users/oranpersonal/.cursor/plans/agency_site_admin_phase_cccd654c.plan.md
--      docs/saas/phase-5/00-guardrails.md
--      docs/saas/phase-5/m0-readiness-checklist.md
--
-- Strictly ADDITIVE to the M0 batch (20260620100000_saas_p5_m0_site_admin_foundations.sql).
-- No M0 contracts change. No new tables.
--
-- Adds to public.agency_business_identity:
--   - default_locale                          (platform-allowed)
--   - supported_locales[]                     (platform-allowed, non-empty, unique via schema layer)
--   - seo_default_title / seo_default_description
--   - seo_default_share_image_media_asset_id  (FK media_assets, ON DELETE SET NULL)
--   - primary_cta_label / primary_cta_href    (paired — both or neither)
--
-- Adds to public.agency_branding:
--   - secondary_color                         (nullable; validated Zod-side)
--
-- Platform locale allow-list is ['en','es'] — MUST stay aligned with:
--   web/src/lib/site-admin/locales.ts   (single source of truth)
--   web/src/middleware.ts               (locale canonicalization)
--   any CMS Zod validator accepting a locale
--
-- Idempotent via IF NOT EXISTS / DO blocks (Postgres has no
-- "ADD CONSTRAINT IF NOT EXISTS"; we guard via pg_constraint lookup).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. agency_business_identity — localization + site defaults columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_business_identity
  ADD COLUMN IF NOT EXISTS default_locale TEXT NOT NULL DEFAULT 'en';

ALTER TABLE public.agency_business_identity
  ADD COLUMN IF NOT EXISTS supported_locales TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[];

ALTER TABLE public.agency_business_identity
  ADD COLUMN IF NOT EXISTS seo_default_title TEXT;

ALTER TABLE public.agency_business_identity
  ADD COLUMN IF NOT EXISTS seo_default_description TEXT;

ALTER TABLE public.agency_business_identity
  ADD COLUMN IF NOT EXISTS seo_default_share_image_media_asset_id UUID
    REFERENCES public.media_assets(id) ON DELETE SET NULL;

ALTER TABLE public.agency_business_identity
  ADD COLUMN IF NOT EXISTS primary_cta_label TEXT;

ALTER TABLE public.agency_business_identity
  ADD COLUMN IF NOT EXISTS primary_cta_href TEXT;

-- ---------------------------------------------------------------------------
-- 2. CHECK constraints — idempotent add-only
-- ---------------------------------------------------------------------------

-- supported_locales must be non-empty
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_business_identity_supported_locales_nonempty'
      AND conrelid = 'public.agency_business_identity'::regclass
  ) THEN
    ALTER TABLE public.agency_business_identity
      ADD CONSTRAINT agency_business_identity_supported_locales_nonempty
        CHECK (array_length(supported_locales, 1) >= 1);
  END IF;
END$$;

-- default_locale must be a member of supported_locales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_business_identity_default_in_supported'
      AND conrelid = 'public.agency_business_identity'::regclass
  ) THEN
    ALTER TABLE public.agency_business_identity
      ADD CONSTRAINT agency_business_identity_default_in_supported
        CHECK (default_locale = ANY(supported_locales));
  END IF;
END$$;

-- supported_locales values must be within the platform allow-list.
-- SOURCE OF TRUTH: web/src/lib/site-admin/locales.ts :: PLATFORM_LOCALES
-- If PLATFORM_LOCALES changes, ship a follow-up migration dropping + recreating
-- this constraint atomically.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_business_identity_supported_locales_platform_allowed'
      AND conrelid = 'public.agency_business_identity'::regclass
  ) THEN
    ALTER TABLE public.agency_business_identity
      ADD CONSTRAINT agency_business_identity_supported_locales_platform_allowed
        CHECK (supported_locales <@ ARRAY['en','es']::TEXT[]);
  END IF;
END$$;

-- default_locale must also be within the platform allow-list
-- (defense in depth; redundant with the pair check + array check above, but
-- surfaces clearer errors if a bad default slips past the array guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_business_identity_default_locale_platform_allowed'
      AND conrelid = 'public.agency_business_identity'::regclass
  ) THEN
    ALTER TABLE public.agency_business_identity
      ADD CONSTRAINT agency_business_identity_default_locale_platform_allowed
        CHECK (default_locale = ANY (ARRAY['en','es']::TEXT[]));
  END IF;
END$$;

-- primary CTA: both label + href or neither (no half-configured CTAs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_business_identity_cta_paired'
      AND conrelid = 'public.agency_business_identity'::regclass
  ) THEN
    ALTER TABLE public.agency_business_identity
      ADD CONSTRAINT agency_business_identity_cta_paired
        CHECK (
          (primary_cta_label IS NULL AND primary_cta_href IS NULL)
          OR (primary_cta_label IS NOT NULL AND primary_cta_href IS NOT NULL)
        );
  END IF;
END$$;

-- SEO defaults: bound length to keep rendered metatags within spec.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_business_identity_seo_default_title_len'
      AND conrelid = 'public.agency_business_identity'::regclass
  ) THEN
    ALTER TABLE public.agency_business_identity
      ADD CONSTRAINT agency_business_identity_seo_default_title_len
        CHECK (seo_default_title IS NULL OR char_length(seo_default_title) <= 120);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_business_identity_seo_default_description_len'
      AND conrelid = 'public.agency_business_identity'::regclass
  ) THEN
    ALTER TABLE public.agency_business_identity
      ADD CONSTRAINT agency_business_identity_seo_default_description_len
        CHECK (seo_default_description IS NULL OR char_length(seo_default_description) <= 320);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_business_identity_primary_cta_label_len'
      AND conrelid = 'public.agency_business_identity'::regclass
  ) THEN
    ALTER TABLE public.agency_business_identity
      ADD CONSTRAINT agency_business_identity_primary_cta_label_len
        CHECK (primary_cta_label IS NULL OR char_length(primary_cta_label) <= 60);
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. agency_branding — secondary color
-- ---------------------------------------------------------------------------

ALTER TABLE public.agency_branding
  ADD COLUMN IF NOT EXISTS secondary_color TEXT;

-- Shape check: hex color only (same style as existing primary_color validation
-- applied at the Zod layer; DB-side we only require a reasonable length + hash
-- prefix so the column stays forgiving of future token-referenced values).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agency_branding_secondary_color_shape'
      AND conrelid = 'public.agency_branding'::regclass
  ) THEN
    ALTER TABLE public.agency_branding
      ADD CONSTRAINT agency_branding_secondary_color_shape
        CHECK (
          secondary_color IS NULL
          OR secondary_color ~ '^#[0-9a-fA-F]{6}$'
        );
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4. Comments documenting the M1 surface
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.agency_business_identity.default_locale IS
  'M1. Default locale for this tenant. Must be in supported_locales and within PLATFORM_LOCALES (web/src/lib/site-admin/locales.ts).';

COMMENT ON COLUMN public.agency_business_identity.supported_locales IS
  'M1. Locales this tenant publishes. Subset of PLATFORM_LOCALES. Non-empty. Storefront falls back to default_locale for supported-but-missing locales.';

COMMENT ON COLUMN public.agency_business_identity.seo_default_title IS
  'M1. Fallback <title> template used when a page provides none. <=120 chars.';

COMMENT ON COLUMN public.agency_business_identity.seo_default_description IS
  'M1. Fallback meta description when a page provides none. <=320 chars.';

COMMENT ON COLUMN public.agency_business_identity.seo_default_share_image_media_asset_id IS
  'M1. Fallback OpenGraph image. Soft-delete safe (media_assets ON DELETE SET NULL).';

COMMENT ON COLUMN public.agency_business_identity.primary_cta_label IS
  'M1. Tenant-global primary CTA label. Consumed by header CTA + hero sections.';

COMMENT ON COLUMN public.agency_business_identity.primary_cta_href IS
  'M1. Tenant-global primary CTA URL. Paired with primary_cta_label (both or neither).';

COMMENT ON COLUMN public.agency_branding.secondary_color IS
  'M1. Optional secondary brand color. Hex only; Zod-validated against token registry agency-configurable allow-list.';

COMMIT;
