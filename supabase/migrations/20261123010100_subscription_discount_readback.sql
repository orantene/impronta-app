-- Discount read-back + the indexes honest revenue numbers need.
--
-- WHY READ-BACK: the webhook sync reads a subscription's customer, price,
-- period and trial_end, but never its discount — so Platform HQ literally
-- could not display "this account is on 30% off", and a discount removed from
-- the Stripe dashboard would leave our UI claiming it was still applied.
-- Stripe stays the executor; these columns are our mirror of what it reports.
--
-- Nulling them out is meaningful: it is how a discount removed anywhere
-- (our UI, the Stripe dashboard, coupon expiry) propagates back to us.

ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_coupon_id          text,
  ADD COLUMN IF NOT EXISTS discount_percent_off      numeric,
  ADD COLUMN IF NOT EXISTS discount_amount_off_cents bigint,
  ADD COLUMN IF NOT EXISTS discount_ends_at          timestamptz;

ALTER TABLE public.talent_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_coupon_id          text,
  ADD COLUMN IF NOT EXISTS discount_percent_off      numeric,
  ADD COLUMN IF NOT EXISTS discount_amount_off_cents bigint,
  ADD COLUMN IF NOT EXISTS discount_ends_at          timestamptz;

-- WHY THESE INDEXES: platform MRR and the dunning count both scan for the same
-- handful of live statuses. Partial keeps them tiny — cancelled history, which
-- is the bulk of the table over time, is not indexed here.
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_live_status
  ON public.workspace_subscriptions (status)
  WHERE status IN ('active', 'past_due', 'trialing');

CREATE INDEX IF NOT EXISTS idx_talent_subscriptions_live_status
  ON public.talent_subscriptions (status)
  WHERE status IN ('active', 'past_due', 'trialing');

COMMENT ON COLUMN public.workspace_subscriptions.stripe_coupon_id IS
  'Mirror of the coupon Stripe reports on this subscription. NULL means no discount is applied right now, including when one was removed upstream.';
COMMENT ON COLUMN public.talent_subscriptions.stripe_coupon_id IS
  'Mirror of the coupon Stripe reports on this subscription. NULL means no discount is applied right now, including when one was removed upstream.';
