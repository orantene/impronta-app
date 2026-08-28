-- Per-account subscription discounts.
--
-- WHY: until now the only way to give one account a better deal was a PLAN
-- OVERRIDE — a 100%-off grant whose `grant_kind='promo'` label reads like a
-- discount but has zero billing effect. There was no way to say "Impronta pays
-- Agency at 30% off" and have Stripe actually invoice it. This table is that.
--
-- Scope is deliberately the SUBSCRIPTION price only (owner decision 2026-08-27).
-- Booking-commission discounts already have their own home in
-- `workspace_commission_overrides`, whose per-account shape this mirrors.
--
-- Stripe has no customer-scoped coupon, so the executor pattern is
-- "private coupon + attach": one coupon per row, never a typeable code, applied
-- to the subscription (or handed to Checkout for an account that has not
-- subscribed yet). `stripe_coupon_id IS NULL` is the sanctioned stub state —
-- the row is real, Stripe just has not caught up, and the UI shows amber.

CREATE TABLE public.subscription_discounts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one subject. The CHECK below is what keeps this honest.
  subject_type            text NOT NULL CHECK (subject_type IN ('workspace', 'talent')),
  tenant_id               uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id       uuid REFERENCES public.talent_profiles(id) ON DELETE CASCADE,

  kind                    text NOT NULL CHECK (kind IN ('percent', 'fixed')),
  -- percent: 1-100. fixed: MAJOR currency units (the action converts to cents).
  value                   numeric NOT NULL CHECK (value > 0),
  currency                text CHECK (currency IS NULL OR length(currency) = 3),

  duration                text NOT NULL DEFAULT 'forever'
                            CHECK (duration IN ('once', 'repeating', 'forever')),
  duration_months         int CHECK (duration_months IS NULL OR duration_months > 0),

  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),

  -- Stripe execution state. Null coupon = stub (saved here, not yet in Stripe).
  stripe_coupon_id        text,
  applied_subscription_id text,
  applied_at              timestamptz,
  sync_error              text,

  note                    text,
  set_by                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ended_at                timestamptz,
  ended_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscription_discounts_one_subject CHECK (
       (subject_type = 'workspace' AND tenant_id IS NOT NULL AND talent_profile_id IS NULL)
    OR (subject_type = 'talent'    AND talent_profile_id IS NOT NULL AND tenant_id IS NULL)
  ),
  -- A fixed-amount discount without a currency is meaningless to Stripe.
  CONSTRAINT subscription_discounts_fixed_needs_currency CHECK (
    kind <> 'fixed' OR currency IS NOT NULL
  ),
  CONSTRAINT subscription_discounts_repeating_needs_months CHECK (
    duration <> 'repeating' OR duration_months IS NOT NULL
  )
);

-- One ACTIVE discount per subject. Ending a row (status='ended') frees the slot,
-- which is why these are partial rather than plain unique indexes: the history
-- of past discounts stays queryable.
CREATE UNIQUE INDEX subscription_discounts_one_active_workspace
  ON public.subscription_discounts (tenant_id)
  WHERE status = 'active' AND subject_type = 'workspace';

CREATE UNIQUE INDEX subscription_discounts_one_active_talent
  ON public.subscription_discounts (talent_profile_id)
  WHERE status = 'active' AND subject_type = 'talent';

-- Reconciling a webhook read-back looks a row up by the coupon Stripe reports.
CREATE INDEX idx_subscription_discounts_coupon
  ON public.subscription_discounts (stripe_coupon_id)
  WHERE stripe_coupon_id IS NOT NULL;

CREATE TRIGGER set_subscription_discounts_updated_at
  BEFORE UPDATE ON public.subscription_discounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_pricing_updated_at();

-- Service-role only, matching the product_* tables: this is platform-admin
-- money configuration, never read directly by a tenant session.
ALTER TABLE public.subscription_discounts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.subscription_discounts IS
  'Per-account subscription discounts (percent or fixed) granted from Platform HQ. Executed in Stripe as a private coupon attached to the account''s subscription. Distinct from workspace_plan_overrides, which are free plan GRANTS with no billing effect.';
