-- Platform-level fallback starting price for talent directory cards.
--
-- Cards show "From $X" from the talent's own published offering. Most rosters
-- start out with nobody having entered pricing, so the signal that helps a
-- client choose is missing on almost every card. This column is the last link
-- in the fallback chain:
--
--   talent's own published price
--     -> tenant default for the talent's primary type   (agencies.settings)
--     -> tenant global default                          (agencies.settings)
--     -> THIS platform default
--     -> nothing rendered
--
-- NULL by default and deliberately so: the platform cannot know what any given
-- agency charges, so nothing is ever shown until a super_admin explicitly sets
-- a number they stand behind. Currency follows platform_settings.operating_currency.
--
-- A talent who deliberately published "quote on request" is NEVER overridden by
-- any default in this chain — that choice is theirs (enforced in
-- lib/directory/price-from.ts).
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS default_talent_price_from_cents BIGINT;

COMMENT ON COLUMN public.platform_settings.default_talent_price_from_cents IS
  'Fallback "From $X" shown on talent cards when neither the talent nor their tenant has pricing. NULL = show nothing. Never overrides a deliberate quote-only talent.';

ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_default_talent_price_positive
  CHECK (default_talent_price_from_cents IS NULL OR default_talent_price_from_cents > 0);
