-- Phase 8.1 — Stripe billing: stripe_customers + workspace_subscriptions.
--
-- These tables are written by the Stripe webhook handler (service-role) and
-- read by the workspace Account & billing page (RLS: staff can read own tenant).
--
-- On first Stripe checkout the webhook creates rows in both tables and updates
-- agencies.plan_tier to match the purchased plan.
--
-- Free-plan workspaces have NO rows in these tables; they use plan_tier='free'
-- from the agencies column alone.

BEGIN;

-- ─── stripe_customers ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stripe_customers (
  tenant_id           UUID        PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT        NOT NULL UNIQUE,
  billing_email       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_customers IS
  'Maps Tulala tenants to their Stripe Customer objects. Created on first checkout. Platform writes only via webhook.';

ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

-- Agency staff can read their own row (e.g. to display billing email).
DROP POLICY IF EXISTS stripe_customers_staff_read ON public.stripe_customers;
CREATE POLICY stripe_customers_staff_read ON public.stripe_customers
  FOR SELECT
  USING (public.is_agency_staff());

-- ─── workspace_subscriptions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL UNIQUE REFERENCES public.agencies(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT        NOT NULL UNIQUE,
  stripe_customer_id      TEXT        NOT NULL,
  -- plan_key mirrors agencies.plan_tier for the subscribed plan.
  plan_key                TEXT        NOT NULL
                            CHECK (plan_key IN ('free','studio','agency','network')),
  -- status mirrors Stripe subscription.status values.
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
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  -- When true: subscription is active but will not renew — ends at current_period_end.
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT FALSE,
  cancelled_at            TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  -- The Stripe Price ID driving this subscription (for reference).
  stripe_price_id         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspace_subscriptions IS
  'Active Stripe subscription record per workspace. Status is the canonical billing state; agencies.plan_tier is always synced to match. Webhook handler writes; app reads.';

ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

-- Agency staff can read their own subscription row (for billing page display).
DROP POLICY IF EXISTS workspace_subscriptions_staff_read ON public.workspace_subscriptions;
CREATE POLICY workspace_subscriptions_staff_read ON public.workspace_subscriptions
  FOR SELECT
  USING (public.is_agency_staff());

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_tenant_id
  ON public.workspace_subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_stripe_sub_id
  ON public.workspace_subscriptions (stripe_subscription_id);

-- ─── Updated-at triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.billing_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON public.stripe_customers;
CREATE TRIGGER trg_stripe_customers_updated_at
  BEFORE UPDATE ON public.stripe_customers
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

DROP TRIGGER IF EXISTS trg_workspace_subscriptions_updated_at ON public.workspace_subscriptions;
CREATE TRIGGER trg_workspace_subscriptions_updated_at
  BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_touch_updated_at();

COMMIT;
