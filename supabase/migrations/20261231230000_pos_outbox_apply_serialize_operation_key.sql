-- pos_outbox_apply raced on operation_key: the idempotency-key SELECT ran
-- BEFORE the device row was locked FOR UPDATE, so two concurrent calls with
-- the same operation_key both passed the "not found" check, both locked the
-- device one after another, and the second's INSERT hit
-- pos_outbox_operation_key_uniq as an uncaught 23505 instead of returning the
-- idempotent "already" reply the function promises every other caller. Found
-- live on the isolated branch via web/scripts/verify-outbox-replay.mjs.
--
-- Fix: lock the device row first (the function's own natural serialization
-- point — command application is per-device), THEN check for an existing
-- operation_key row under that lock. A second concurrent caller now blocks
-- on the device lock until the first commits, re-reads, finds the row the
-- first just inserted, and returns 'already' cleanly. No behavior changes
-- for the non-racing path.

CREATE OR REPLACE FUNCTION public.pos_outbox_apply(
  p_tenant_id uuid,
  p_device_id uuid,
  p_operation_key text,
  p_command jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_device public.pos_devices%ROWTYPE;
  v_existing public.pos_outbox%ROWTYPE;
  v_kind text;
  v_method text;
  v_reserve jsonb;
  v_row public.pos_outbox%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_device_id IS NULL OR char_length(v_key) < 8 OR p_command IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  -- Lock the device FIRST so operation_key idempotency is checked under a
  -- lock a concurrent caller for the same device actually waits on.
  SELECT * INTO v_device FROM public.pos_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.tenant_id IS DISTINCT FROM p_tenant_id OR v_device.status = 'disabled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_device');
  END IF;

  SELECT * INTO v_existing
    FROM public.pos_outbox
   WHERE tenant_id = p_tenant_id AND operation_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'id', v_existing.id, 'result', v_existing.result);
  END IF;

  v_kind := p_command->>'kind';
  v_method := COALESCE(p_command->>'method', 'cash');
  IF v_kind IS DISTINCT FROM 'cash_collect'
     OR v_method IS DISTINCT FROM 'cash'
     OR p_command ? 'provider'
     OR p_command ? 'payment_intent'
     OR p_command ? 'checkout_session' THEN
    INSERT INTO public.pos_outbox (tenant_id, device_id, command, operation_key, applied_at, result)
    VALUES (
      p_tenant_id, p_device_id, p_command, v_key, now(),
      jsonb_build_object('ok', false, 'reason', 'not_replayable')
    )
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('ok', false, 'reason', 'not_replayable', 'id', v_row.id);
  END IF;

  IF p_command->>'order_id' IS NULL OR COALESCE((p_command->>'amount_cents')::bigint, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  v_reserve := public.pos_reserve_collection(
    p_tenant_id,
    (p_command->>'order_id')::uuid,
    v_key,
    (p_command->>'amount_cents')::bigint,
    'cash',
    COALESCE(v_device.registered_by, p_tenant_id),
    NULL,
    120
  );
  IF (v_reserve->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_reserve->>'reason', 'unavailable'));
  END IF;

  INSERT INTO public.pos_outbox (tenant_id, device_id, command, operation_key, applied_at, result)
  VALUES (p_tenant_id, p_device_id, p_command, v_key, now(), v_reserve)
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'result', v_reserve);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_outbox_apply(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_outbox_apply(uuid, uuid, text, jsonb) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_outbox_apply(uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos_outbox_apply is executable by anon';
  END IF;
  IF has_function_privilege('authenticated', 'public.pos_outbox_apply(uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos_outbox_apply is executable by authenticated';
  END IF;
END
$check$;
