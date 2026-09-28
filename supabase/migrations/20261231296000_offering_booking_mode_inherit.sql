-- WSF-B: talent_offerings.booking_mode can INHERIT the talent default.
--
-- Precedence (Website Settings Foundation, product rules §1):
--   master restriction > service mode when set > talent default
--   (talent_profiles.selling_defaults.bookingPosture) > platform default.
-- NULL now means "this service inherits the talent default". The single
-- resolver is resolveEffectiveBookingMode (web/src/lib/scheduling/instant-book-gates.ts).
--
-- ADDITIVE / WIDENING ONLY:
--   * drop NOT NULL only. DEFAULT 'request' is KEPT: this migration is applied
--     before WSF-B's readers ship, so live writers that omit the column must
--     keep storing 'request', never NULL. NULL is written only by an explicit
--     "Reset to default" (WSF-B code). Dropping the default is a later,
--     code-first change once every reader resolves NULL;
--   * widen the value CHECK to add 'inquiry' (service answered by conversation).
--   Existing rows are NOT touched: they keep their value and become explicit.
--
-- Row counts on the linked project before this migration (2026-09-27):
--   booking_mode = 'instant' : 26
--   booking_mode = 'request' : 173
--   booking_mode IS NULL     : 0
--   selling_defaults.bookingPosture: 'on_demand' 1, unset 107, 'inquiry' 0.
-- After: identical (no UPDATE here). Verify with
--   select coalesce(booking_mode,'<null>'), count(*) from public.talent_offerings group by 1;
--
-- talent_offerings_instant_needs_price is unchanged and keeps working with
-- NULL: (NULL <> 'instant') is NULL, which a CHECK accepts. An inherited row
-- whose talent default is instant is still only bookable instantly with an
-- exact price, because the app derives quote/custom/from rows to
-- "ask for a quote" and offeringIsDirectlyBookable requires an exact price.

ALTER TABLE public.talent_offerings
  ALTER COLUMN booking_mode DROP NOT NULL;

ALTER TABLE public.talent_offerings
  DROP CONSTRAINT IF EXISTS talent_offerings_booking_mode_check;

ALTER TABLE public.talent_offerings
  ADD CONSTRAINT talent_offerings_booking_mode_check
  CHECK (booking_mode IS NULL OR booking_mode IN ('request', 'instant', 'inquiry'));

COMMENT ON COLUMN public.talent_offerings.booking_mode IS
  'request | instant | inquiry, or NULL = inherit the talent default (selling_defaults.bookingPosture). Resolve with resolveEffectiveBookingMode.';
