-- Marketing campaigns: the money and the entitlement, applied together.
--
-- THE PROBLEM THIS SOLVES: the owner's actual offer is "two months free WITH
-- full premium support". Those are two unrelated systems today -- a discount
-- (product_discounts, which Stripe bills) and a plan grant
-- (workspace_plan_overrides, which decides what the account can DO). Running
-- that campaign meant remembering to do both, by hand, for every redeemer.
-- Forgetting the second half means the customer paid nothing AND got nothing
-- extra, which is the worst of both.
--
-- A campaign names the offer once and says what BOTH halves are. Discount rows
-- already carry a free-form `campaign` label; this gives that label a home with
-- meaning attached, and lets redemptions roll up per campaign for reporting.

CREATE TABLE public.marketing_campaigns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Matches product_discounts.campaign. Upper-cased on write so "launch2026"
  -- and "LAUNCH2026" cannot become two campaigns telling different stories.
  slug                text NOT NULL UNIQUE CHECK (slug = upper(slug) AND length(slug) BETWEEN 2 AND 60),
  name                text NOT NULL,
  description         text,

  -- The ENTITLEMENT half. Null = a money-only campaign, which is the common
  -- case; the discount alone is the whole offer.
  grant_plan_tier     text,
  grant_duration_days int CHECK (grant_duration_days IS NULL OR grant_duration_days > 0),

  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  starts_at           timestamptz,
  ends_at             timestamptz,

  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- A grant with no duration would be a permanent free upgrade handed out by a
  -- marketing code. Refuse the half-configured state at the database.
  CONSTRAINT marketing_campaigns_grant_needs_duration CHECK (
    grant_plan_tier IS NULL OR grant_duration_days IS NOT NULL
  )
);

CREATE INDEX idx_marketing_campaigns_active
  ON public.marketing_campaigns (slug) WHERE status = 'active';

CREATE TRIGGER set_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_pricing_updated_at();

-- Service-role only, matching product_discounts and subscription_discounts:
-- this is platform-admin commercial configuration, never read by a tenant.
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.marketing_campaigns IS
  'A named marketing offer. Joins product_discounts.campaign (the money) to an optional plan grant (the entitlement), so "two months free with premium support" is one configuration instead of two manual steps.';
COMMENT ON COLUMN public.marketing_campaigns.grant_plan_tier IS
  'Plan tier to grant a redeemer for grant_duration_days. NULL means the discount is the entire offer.';
