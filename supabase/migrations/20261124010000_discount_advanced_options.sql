-- Discount advanced options — the ecommerce option set the owner asked for.
--
-- ALREADY APPLIED to production as version 20261124010000; this file records
-- it so the repo's migration history matches the database instead of the two
-- drifting apart silently. Every statement is guarded, so re-running is a
-- no-op on a database that already has the columns.
--
-- Why each column exists:
--   first_time_only          → Stripe promotion-code restriction
--                              `first_time_transaction`. A launch code that
--                              existing customers can also redeem is a
--                              discount on revenue we already had.
--   minimum_amount_cents     → Stripe restriction `minimum_amount`. Keeps a
--   minimum_amount_currency    "$50 off" code off a $29 plan.
--   campaign                 → free-text grouping label so redemptions roll up
--                              ("LAUNCH brought 40 signups"). The redemption
--                              ledger already records who and when, so this is
--                              reporting, not new plumbing.

ALTER TABLE public.product_discounts
  ADD COLUMN IF NOT EXISTS first_time_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minimum_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS minimum_amount_currency text,
  ADD COLUMN IF NOT EXISTS campaign text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.product_discounts'::regclass
       AND conname = 'product_discounts_minimum_amount_cents_check'
  ) THEN
    ALTER TABLE public.product_discounts
      ADD CONSTRAINT product_discounts_minimum_amount_cents_check
      CHECK (minimum_amount_cents IS NULL OR minimum_amount_cents > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.product_discounts'::regclass
       AND conname = 'product_discounts_minimum_amount_currency_check'
  ) THEN
    ALTER TABLE public.product_discounts
      ADD CONSTRAINT product_discounts_minimum_amount_currency_check
      CHECK (minimum_amount_currency IS NULL OR length(minimum_amount_currency) = 3);
  END IF;

  -- A minimum amount with no currency is not a rule Stripe can enforce.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.product_discounts'::regclass
       AND conname = 'product_discounts_minimum_needs_currency'
  ) THEN
    ALTER TABLE public.product_discounts
      ADD CONSTRAINT product_discounts_minimum_needs_currency
      CHECK (minimum_amount_cents IS NULL OR minimum_amount_currency IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_discounts_campaign
  ON public.product_discounts (campaign)
  WHERE campaign IS NOT NULL;

COMMENT ON COLUMN public.product_discounts.campaign IS
  'Free-text campaign tag. Groups codes so redemptions roll up per campaign; the discount_redemptions ledger supplies the counts.';
