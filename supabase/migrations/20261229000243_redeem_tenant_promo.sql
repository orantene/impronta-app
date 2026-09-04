-- 0.9 — atomic promo redemption.
--
-- `applyPromo` (lib/events/promo.ts) is PURE and takes the redemption counts
-- the caller supplies: "what the caller has counted, from rows, before asking".
-- That is the correct shape for a decision function and it leaves a race the
-- caller must close, because between counting and inserting, another buyer can
-- take the last redemption. Both then pass their check and both insert.
--
-- A discount with `max_redemptions` or `per_customer_limit` is a CONTENDED
-- RESOURCE, not a calculation. This is the same discipline the capacity engine
-- uses for seats: the invariant lives where concurrent callers actually meet,
-- which is one row lock in the database, not in whichever process counted first.

-- An order redeems a code at most once. Makes a retry idempotent rather than a
-- second redemption, which matters because the purchase pipeline can be retried
-- on a transient failure after the redemption has already landed.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_promo_redemptions_order_code_uniq
  ON public.tenant_promo_redemptions (promo_code_id, order_id);

CREATE OR REPLACE FUNCTION public.redeem_tenant_promo(
  p_code_id      UUID,
  p_order_id     UUID,
  p_customer_id  UUID,
  p_amount_cents BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code        public.tenant_promo_codes%ROWTYPE;
  v_total       INTEGER;
  v_for_cust    INTEGER;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  -- THE LOCK IS THE POINT. Every concurrent redeemer of this code queues here,
  -- so the counts below are taken while no one else can insert. Without it the
  -- checks are advisory and a 100-redemption code can issue 102.
  SELECT * INTO v_code
    FROM public.tenant_promo_codes
   WHERE id = p_code_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;

  IF NOT v_code.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;

  -- Re-checked HERE even though `applyPromo` already checked them. The pure
  -- function decided against counts taken before the lock; these are taken
  -- after it. If they disagree, the ones under the lock are the true ones.
  SELECT count(*) INTO v_total
    FROM public.tenant_promo_redemptions WHERE promo_code_id = p_code_id;

  IF v_code.max_redemptions IS NOT NULL AND v_total >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;

  -- A NULL customer cannot be limited per-customer: there is no one to count.
  -- Refused rather than silently treated as unlimited, which would make an
  -- anonymous checkout the way around a one-per-person code.
  -- `per_customer_limit` is NOT NULL with CHECK (> 0), so there is no
  -- "unlimited" sentinel and no null branch to write: the limit ALWAYS applies.
  -- Checked against the live schema rather than assumed — a 0 meaning
  -- "unlimited" would have made `>=` refuse every buyer.
  IF p_customer_id IS NULL THEN
    -- Refused, not treated as unlimited. Treating an unknown buyer as exempt
    -- would make an anonymous checkout the way around a one-per-person code.
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_required');
  END IF;

  SELECT count(*) INTO v_for_cust
    FROM public.tenant_promo_redemptions
   WHERE promo_code_id = p_code_id AND customer_id = p_customer_id;

  IF v_for_cust >= v_code.per_customer_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_limit_reached');
  END IF;

  INSERT INTO public.tenant_promo_redemptions
    (promo_code_id, order_id, customer_id, amount_cents)
  VALUES (p_code_id, p_order_id, p_customer_id, p_amount_cents)
  ON CONFLICT (promo_code_id, order_id) DO NOTHING;

  -- A swallowed conflict is THIS order redeeming twice, which is the idempotent
  -- retry the unique index exists for. Reported distinctly so a caller can tell
  -- "already redeemed" from "redeemed just now" instead of inferring it.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

-- FROM PUBLIC IS NOT ENOUGH, verified rather than assumed.
--
-- After applying with `FROM PUBLIC` alone, `has_function_privilege('anon', …)`
-- still returned TRUE: Supabase grants `anon` and `authenticated` explicitly on
-- the public schema, and revoking the PUBLIC pseudo-role does not touch an
-- explicit grant to a named role. A SECURITY DEFINER function that `anon` can
-- execute would have let an unauthenticated caller write redemption rows
-- against any order id.
--
-- This repo has the mirror-image incident on file ("REVOKE FROM anon is a
-- no-op; only FROM PUBLIC works"). Both are true and neither is sufficient
-- alone, which is why the names are listed AND the result is asserted below.
REVOKE ALL ON FUNCTION public.redeem_tenant_promo(UUID, UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_tenant_promo(UUID, UUID, UUID, BIGINT) TO service_role;

COMMENT ON FUNCTION public.redeem_tenant_promo(UUID, UUID, UUID, BIGINT) IS
  'Atomically records a promo redemption. Locks the code row, re-checks both '
  'limits under the lock, and inserts. Returns {ok,reason} JSON; never raises '
  'for an ordinary refusal. `applyPromo` decides worth, this decides whether '
  'this buyer gets it.';

-- Assert the grant actually landed. A REVOKE that silently fails to remove a
-- privilege is invisible, and the check costs nothing on replay.
DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.redeem_tenant_promo(uuid,uuid,uuid,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.redeem_tenant_promo(uuid,uuid,uuid,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'redeem_tenant_promo is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;
