-- Phase 8.2 — Talent subscription tiers: Basic (free) / Pro ($12/mo) / Portfolio ($29/mo).
--
-- talent_profiles already has membership_tier (old enum: free/free_trial/premium/featured).
-- Rather than reshape that enum (OPERATING.md rule: no enum reshape during build), we add
-- a new talent_plan_key TEXT column — same pattern as agencies.plan_tier (TEXT + CHECK).
-- The old membership_tier column is preserved for backward compat; talent_plan_key is
-- the canonical source of truth for the new subscription model.
--
-- talent_stripe_customers: maps user_id → Stripe Customer ID for talent payments.
-- talent_subscriptions: active Stripe subscription per talent profile.
--   One row per talent profile (the page being upgraded).
--   Synced by the Stripe webhook handler.
--
-- Pricing (per plan-catalog.ts):
--   talent_basic: free (no Stripe subscription)
--   talent_pro: $12/mo | $120/yr
--   talent_portfolio: $29/mo | $290/yr

BEGIN;

-- ─── talent_plan_key column on talent_profiles ────────────────────────────────

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS talent_plan_key TEXT NOT NULL DEFAULT 'talent_basic'
    CHECK (talent_plan_key IN ('talent_basic', 'talent_pro', 'talent_portfolio'));

COMMENT ON COLUMN public.talent_profiles.talent_plan_key IS
  'Canonical talent subscription tier (Phase 8.2). One of talent_basic | talent_pro | talent_portfolio. Source of truth for page enhancement gates; synced from Stripe webhook.';

-- ─── talent_stripe_customers ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_stripe_customers (
  user_id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT        NOT NULL UNIQUE,
  billing_email       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talent_stripe_customers IS
  'Maps talent user_id to their Stripe Customer object for personal-page subscription payments. One row per user — independent of workspace billing.';

ALTER TABLE public.talent_stripe_customers ENABLE ROW LEVEL SECURITY;

-- Talent can read their own row.
DROP POLICY IF EXISTS talent_stripe_customers_self_read ON public.talent_stripe_customers;
CREATE POLICY talent_stripe_customers_self_read ON public.talent_stripe_customers
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── talent_subscriptions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One active subscription per talent profile (the page being enhanced).
  talent_profile_id       UUID        NOT NULL UNIQUE REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT        NOT NULL UNIQUE,
  stripe_customer_id      TEXT        NOT NULL,
  plan_key                TEXT        NOT NULL
                            CHECK (plan_key IN ('talent_pro', 'talent_portfolio')),
  status                  TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN (
                              'trialing',
                              'active',
                              'past_due',
                              'cancelled',
                              'paused',
                              'incomplete',
                              'incomplete_expired'
                            )),
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
  cancelled_at            TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  stripe_price_id         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talent_subscriptions IS
  'Active Stripe subscription for a talent personal-page upgrade. One row per talent profile. Webhook handler writes; talent_profiles.talent_plan_key is always synced to match. Free (talent_basic) has NO row here.';

ALTER TABLE public.talent_subscriptions ENABLE ROW LEVEL SECURITY;

-- Talent can read their own row.
DROP POLICY IF EXISTS talent_subscriptions_self_read ON public.talent_subscriptions;
CREATE POLICY talent_subscriptions_self_read ON public.talent_subscriptions
  FOR SELECT
  USING (user_id = auth.uid());

-- Agency staff can read subscriptions for talent on their roster
-- (needed for platform admin billing views; not needed for talent-facing pages).
DROP POLICY IF EXISTS talent_subscriptions_staff_read ON public.talent_subscriptions;
CREATE POLICY talent_subscriptions_staff_read ON public.talent_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_talent_roster atr
      WHERE atr.talent_profile_id = talent_subscriptions.talent_profile_id
        AND public.is_agency_staff()
    )
  );

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_talent_subscriptions_talent_profile_id
  ON public.talent_subscriptions (talent_profile_id);

CREATE INDEX IF NOT EXISTS idx_talent_subscriptions_user_id
  ON public.talent_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_talent_subscriptions_stripe_sub_id
  ON public.talent_subscriptions (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_talent_profiles_talent_plan_key
  ON public.talent_profiles (talent_plan_key)
  WHERE talent_plan_key <> 'talent_basic';

-- ─── Updated-at triggers ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_talent_stripe_customers_updated_at ON public.talent_stripe_customers;
CREATE TRIGGER trg_talent_stripe_customers_updated_at
  BEFORE UPDATE ON public.talent_stripe_customers
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

DROP TRIGGER IF EXISTS trg_talent_subscriptions_updated_at ON public.talent_subscriptions;
CREATE TRIGGER trg_talent_subscriptions_updated_at
  BEFORE UPDATE ON public.talent_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

COMMIT;
