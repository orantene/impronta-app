-- Tenant localization foundation: explicit public language switcher preference.
--
-- This intentionally extends agency_business_identity instead of introducing a
-- parallel settings table. The actual storefront visibility rule is:
--   show_language_switcher = true AND cardinality(supported_locales) > 1
-- so single-language tenants never show a dead toggle.

BEGIN;

ALTER TABLE public.agency_business_identity
  ADD COLUMN IF NOT EXISTS show_language_switcher BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.agency_business_identity.show_language_switcher IS
  'When true, public/auth tenant chrome may show a language switcher if more than one supported_locale is active. Single-locale tenants always hide it.';

COMMIT;
