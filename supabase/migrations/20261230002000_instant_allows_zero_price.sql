-- Instant booking needs an EXACT price, not a POSITIVE price.
--
-- $0 is a price: complimentary class, table hold, free GA. The original
-- CHECK (20260708161910) required amount_cents > 0, so a published instant
-- offering at zero could not exist on a database rebuilt from migrations,
-- while the journeys fixture plants five of them. Quote/custom/"from" still
-- cannot be instant — those have no amount a guest can take.

ALTER TABLE public.talent_offerings
  DROP CONSTRAINT IF EXISTS talent_offerings_instant_needs_price;

ALTER TABLE public.talent_offerings
  ADD CONSTRAINT talent_offerings_instant_needs_price
  CHECK (booking_mode <> 'instant'
         OR (amount_cents IS NOT NULL AND amount_cents >= 0
             AND price_type <> 'custom' AND price_display = 'exact'));
