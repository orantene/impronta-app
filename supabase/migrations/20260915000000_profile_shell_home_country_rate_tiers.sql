-- Profile shell drawer — residence label + rate tier overrides (JSONB array).
-- Additive, idempotent.

BEGIN;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS home_country_text TEXT;

COMMENT ON COLUMN public.talent_profiles.home_country_text IS
  'Free-text country of residence (agency + talent shell). Distinct from nationality.';

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS rate_tiers_data JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.talent_profiles.rate_tiers_data IS
  'Channel-tier rate overrides from profile shell: [{ typeId, tier, amount, currency, unit }].';

COMMIT;
