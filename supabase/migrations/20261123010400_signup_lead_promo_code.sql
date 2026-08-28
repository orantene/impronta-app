-- Carry ?promo= from the marketing funnel through to checkout.
--
-- Today a visitor arriving on /get-started?promo=CODE gets the code VALIDATED
-- and a friendly label rendered, and then it is dropped on the floor: the lead
-- row has nowhere to keep it and the checkout builders have no parameter for
-- it. The buyer has to retype the same code into Stripe's hosted page.

ALTER TABLE public.saas_marketing_signups
  ADD COLUMN IF NOT EXISTS promo_code text;

COMMENT ON COLUMN public.saas_marketing_signups.promo_code IS
  'Raw ?promo= code captured at signup. Re-validated server-side before it reaches Stripe; never trusted from the URL.';
