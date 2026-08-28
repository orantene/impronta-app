-- Discount redemption ledger + the RPC that keeps the count honest.
--
-- WHY: `product_discounts.redemption_count` has been read since the day it was
-- created (the max-redemptions guard compares against it) and written by
-- NOTHING. The guard has therefore always compared against 0 — a limit that
-- could never be reached. `per_customer_limit` was equally decorative.
--
-- A ledger rather than a bare counter, because "has THIS account already used
-- this code" cannot be answered by an integer, and because a counter alone
-- cannot survive webhook retries.
--
-- Idempotency is doubled on purpose: UNIQUE(stripe_event_id) makes a replayed
-- Stripe event a no-op at the row level, and the counter is bumped ONLY when
-- that insert actually happened.

CREATE TABLE public.discount_redemptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id            uuid NOT NULL REFERENCES public.product_discounts(id) ON DELETE CASCADE,
  subject_type           text NOT NULL CHECK (subject_type IN ('workspace', 'talent', 'client')),
  tenant_id              uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  talent_profile_id      uuid REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  user_id                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  stripe_subscription_id text,
  -- The idempotency key. One Stripe event redeems a code exactly once.
  stripe_event_id        text NOT NULL UNIQUE,
  redeemed_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_discount_redemptions_by_tenant
  ON public.discount_redemptions (discount_id, tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX idx_discount_redemptions_by_talent
  ON public.discount_redemptions (discount_id, talent_profile_id)
  WHERE talent_profile_id IS NOT NULL;

ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;

-- Resolves the discount by the coupon Stripe reports, records the redemption,
-- and increments the counter only on a genuinely new event. Returns whether it
-- recorded anything, so the caller can log a replay without treating it as an
-- error. SECURITY DEFINER because the webhook runs without a user session.
CREATE OR REPLACE FUNCTION public.record_discount_redemption(
  p_stripe_coupon_id      text,
  p_stripe_event_id       text,
  p_subject_type          text,
  p_tenant_id             uuid,
  p_talent_profile_id     uuid,
  p_stripe_subscription_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discount_id uuid;
  v_inserted    boolean := false;
BEGIN
  IF p_stripe_coupon_id IS NULL OR p_stripe_event_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT id INTO v_discount_id
    FROM public.product_discounts
   WHERE stripe_coupon_id = p_stripe_coupon_id
   LIMIT 1;

  -- Not one of our catalog codes (a per-account coupon, or a code minted
  -- straight in Stripe). Nothing to count; not an error.
  IF v_discount_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.discount_redemptions (
    discount_id, subject_type, tenant_id, talent_profile_id,
    stripe_subscription_id, stripe_event_id
  ) VALUES (
    v_discount_id, p_subject_type, p_tenant_id, p_talent_profile_id,
    p_stripe_subscription_id, p_stripe_event_id
  )
  ON CONFLICT (stripe_event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted THEN
    UPDATE public.product_discounts
       SET redemption_count = redemption_count + 1
     WHERE id = v_discount_id;
  END IF;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.record_discount_redemption(text, text, text, uuid, uuid, text) FROM PUBLIC;

COMMENT ON TABLE public.discount_redemptions IS
  'One row per code redemption, keyed by the Stripe event that caused it. Backs both the max-redemptions and per-customer-limit checks, neither of which could be enforced while redemption_count was never written.';
