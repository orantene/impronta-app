-- Record WHO redeemed, not just which account.
--
-- `discount_redemptions.user_id` has existed since the ledger was created and
-- has never held a value: `record_discount_redemption` had no parameter for it,
-- so every row was written with a null. The usage drawer therefore had to
-- RESOLVE an email from `stripe_customers` (workspace only) and show nothing at
-- all for talent, which is a worse answer than the ledger was designed to give.
--
-- Ordering matters here. The new parameter carries a DEFAULT, so a caller that
-- still passes six named arguments resolves to this function unchanged; that is
-- what lets the migration land BEFORE the code that passes the seventh. The old
-- six-argument function is then dropped, because leaving both would make a
-- six-argument call ambiguous rather than compatible.
--
-- The rest of the function is unchanged: ON CONFLICT (stripe_event_id) is still
-- what makes a webhook replay a no-op, and the counter still moves only on the
-- insert that actually happened.

CREATE OR REPLACE FUNCTION public.record_discount_redemption(
  p_stripe_coupon_id      text,
  p_stripe_event_id       text,
  p_subject_type          text,
  p_tenant_id             uuid,
  p_talent_profile_id     uuid,
  p_stripe_subscription_id text,
  p_user_id               uuid DEFAULT NULL
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
    stripe_subscription_id, stripe_event_id, user_id
  ) VALUES (
    v_discount_id, p_subject_type, p_tenant_id, p_talent_profile_id,
    p_stripe_subscription_id, p_stripe_event_id, p_user_id
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

-- `REVOKE ... FROM anon` is a no-op on a function granted to PUBLIC, so this
-- mirrors the original: revoke from PUBLIC, which is the grant that exists.
REVOKE ALL ON FUNCTION public.record_discount_redemption(text, text, text, uuid, uuid, text, uuid) FROM PUBLIC;

-- The 6-argument signature is a DIFFERENT function to Postgres, and leaving it
-- resolvable would let a stale deploy keep writing null user_ids. Dropped once
-- the new one exists.
DROP FUNCTION IF EXISTS public.record_discount_redemption(text, text, text, uuid, uuid, text);
