-- Code discounts: real durations, a scope that is actually enforced, provenance.
--
-- THREE FIXES, all of them long-standing rot:
--
-- 1. DURATION. `stripe-discount-sync.ts` hardcoded `duration: "once"` for every
--    percent and fixed coupon, so a recurring "20% off forever" was simply not
--    expressible from the Pricing tab — while the other discount UI defaulted to
--    "forever". Same product, two silently different behaviours.
--
-- 2. APPLIES_TO. The jsonb column accepted `"all"` or a uuid array, but nothing
--    ever wrote a uuid array and NO read path enforced it — decorative scope.
--    Replaced by a column that is one CHECK and one comparison to honour:
--    which side of the marketplace a code is for. The old column is left in
--    place for now and dropped separately (see the note below).
--
-- 3. SOURCE. Codes are about to be imported from Stripe (the other discount
--    system kept no DB row at all). Knowing which rows we authored versus
--    which we adopted is what makes that import safe to re-run.

ALTER TABLE public.product_discounts
  ADD COLUMN IF NOT EXISTS duration        text NOT NULL DEFAULT 'once'
                             CHECK (duration IN ('once', 'repeating', 'forever')),
  ADD COLUMN IF NOT EXISTS duration_months int
                             CHECK (duration_months IS NULL OR duration_months > 0),
  ADD COLUMN IF NOT EXISTS applies_family  text
                             CHECK (applies_family IS NULL OR applies_family IN ('workspace', 'talent')),
  ADD COLUMN IF NOT EXISTS source          text NOT NULL DEFAULT 'admin'
                             CHECK (source IN ('admin', 'stripe_import'));

-- `free_months` was ALREADY a repeating 100%-off coupon in the Stripe mapping
-- (percent_off 100 + duration repeating + duration_in_months = value). Make the
-- columns say what the coupon always was, so the mapper can stop special-casing.
UPDATE public.product_discounts
   SET duration = 'repeating',
       duration_months = GREATEST(1, round(value)::int)
 WHERE kind = 'free_months'
   AND duration_months IS NULL;

-- NOTE: `applies_to` is deliberately NOT dropped here. Migrations are applied to
-- production BEFORE the code that stops reading them merges (repo protocol), and
-- admin-product-discounts.ts still SELECTs the column -- including from the
-- PUBLIC validateDiscount path the /get-started funnel hits. Dropping it now
-- would 500 the funnel until the next deploy. Expand now, contract later: the
-- DROP ships as its own migration once no reader remains.

COMMENT ON COLUMN public.product_discounts.applies_family IS
  'Which side of the marketplace this code is valid for. NULL = both. Enforced at checkout in resolveCheckoutDiscount, unlike the applies_to jsonb it replaces.';
COMMENT ON COLUMN public.product_discounts.source IS
  'admin = created in Platform HQ. stripe_import = adopted from a Stripe promotion code that predated the single store.';
