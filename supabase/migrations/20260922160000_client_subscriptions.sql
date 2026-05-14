-- D6 — client subscriptions (Standard / Pro / Enterprise tier model).
--
-- Schema only. Stripe Checkout / webhook integration deferred per
-- pending_stripe_live_money_testing.md (user explicitly deferred Stripe
-- ops until "the whole product is ready"). The app reads tier from this
-- table; Stripe will populate it once the subscription flow is wired.
--
-- Default tier when a row is missing for a user = 'standard' (free).
-- Three tiers per binding spec §4.2:
--   standard   — browse + favorites + 1 shortlist + single-talent inquiry
--   pro        — unlimited shortlists + compare + multi-talent inquiry +
--                30-day availability + send-to-client + rate visibility
--   enterprise — Pro + API access + dedicated rep + bulk RFPs + white-label
--
-- Trust ladder (Basic/Verified/Silver/Gold) stays orthogonal — Pro
-- doesn't bypass talent contact gates. See project_client_trust_badges.md.

CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id           UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                     TEXT NOT NULL DEFAULT 'standard'
                                CHECK (tier IN ('standard', 'pro', 'enterprise')),
  status                   TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_user
  ON public.client_subscriptions (client_user_id);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe_subscription
  ON public.client_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON TABLE public.client_subscriptions IS
  'Per-client subscription tier driving Discover power-tool gating. Missing row = standard (free). See project_discover_unified.md §4.';

-- RLS — client sees their own subscription only.
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_subscriptions_own_select ON public.client_subscriptions;
CREATE POLICY client_subscriptions_own_select
  ON public.client_subscriptions FOR SELECT
  USING (client_user_id = auth.uid());

-- Inserts/updates land via the Stripe webhook handler (service-role) when
-- that wires up. No client-self insert/update policies for now — clients
-- can't grant themselves a tier.
