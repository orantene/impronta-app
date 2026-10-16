-- Promos v1 · PR1a (TUL-940): a redemption row has a STATUS, and only some
-- statuses are a "use".
--
-- Until now every row in `tenant_promo_redemptions` counted as a used code, and
-- a full refund DELETED the row. Promos v1 adds holds (`held` → `confirmed` or
-- `released`), so "count every row" would make a released hold burn a use and a
-- venue's "20 comps" code would sell out early. Deleting on refund also erased
-- the audit trail. Contract-first: this column and the readers that respect it
-- ship BEFORE anything writes a non-confirmed row.
--
-- Additive only. Every existing row is a real use, so the default backfills it
-- as `confirmed` and every count stays exactly what it was.

ALTER TABLE public.tenant_promo_redemptions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

DO $c$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenant_promo_redemptions_status_check'
       AND conrelid = 'public.tenant_promo_redemptions'::regclass
  ) THEN
    ALTER TABLE public.tenant_promo_redemptions
      ADD CONSTRAINT tenant_promo_redemptions_status_check
      CHECK (status IN ('held', 'confirmed', 'released', 'voided', 'no_show'));
  END IF;
END
$c$;

COMMENT ON COLUMN public.tenant_promo_redemptions.status IS
  'confirmed = a use. held = reserved against a limit, not yet a use. '
  'released / voided / no_show = not a use. Limits count confirmed + held; '
  'reports count confirmed.';

-- Same signature, same lock, same grants. The only change is WHAT is counted:
-- `confirmed` + `held` guard a limit (a hold reserves the slot); `voided`,
-- `released` and `no_show` free it.
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

  -- THE LOCK IS THE POINT: every concurrent redeemer of this code queues here.
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

  SELECT count(*) INTO v_total
    FROM public.tenant_promo_redemptions
   WHERE promo_code_id = p_code_id
     AND status IN ('confirmed', 'held');

  IF v_code.max_redemptions IS NOT NULL AND v_total >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;

  -- Refused, not treated as unlimited: an anonymous checkout must not be the
  -- way around a one-per-person code. per_customer_limit is NOT NULL, > 0.
  IF p_customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_required');
  END IF;

  SELECT count(*) INTO v_for_cust
    FROM public.tenant_promo_redemptions
   WHERE promo_code_id = p_code_id
     AND customer_id = p_customer_id
     AND status IN ('confirmed', 'held');

  IF v_for_cust >= v_code.per_customer_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_limit_reached');
  END IF;

  INSERT INTO public.tenant_promo_redemptions
    (promo_code_id, order_id, customer_id, amount_cents, status)
  VALUES (p_code_id, p_order_id, p_customer_id, p_amount_cents, 'confirmed')
  ON CONFLICT (promo_code_id, order_id) DO NOTHING;

  -- A swallowed conflict is THIS order redeeming twice: the idempotent retry.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_tenant_promo(UUID, UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_tenant_promo(UUID, UUID, UUID, BIGINT) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.redeem_tenant_promo(uuid,uuid,uuid,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.redeem_tenant_promo(uuid,uuid,uuid,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'redeem_tenant_promo is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;
