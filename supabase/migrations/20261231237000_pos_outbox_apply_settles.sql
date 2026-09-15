-- A4 (audit 2026-09-15): the offline cash outbox could never replay.
--
-- TWO DEFECTS, ONE PATH. The client queued
-- `{kind:"cash_collect", amountCents, orderId}` while this function read
-- `order_id` / `amount_cents`, so every sync was refused `invalid` and the
-- item sat in localStorage forever. And even with the keys matched, the
-- function only RESERVED the balance (120 s) and nothing ever settled it, so
-- an offline cash sale would have been recorded as a claim that lapsed, never
-- as money received. `pos_outbox` had 0 rows on production; D-122 was marked
-- closed on a path that had never run.
--
-- THE CONTRACT NOW. The command shape is the snake_case one this function
-- always read (`web/scripts/verify-outbox-replay.mjs` sends it, the client
-- now sends it too): `{kind:"cash_collect", method:"cash", order_id,
-- amount_cents}`. Replay is TWO steps and the money stays authoritative in SQL:
--
--   1. `pos_outbox_apply` locks the device, checks the operation key, refuses
--      anything naming a provider, and RESERVES the balance through
--      `pos_reserve_collection` under the outbox's own operation key, with
--      the same 900 s cash TTL the live tender uses. The outbox row is
--      inserted with `applied_at NULL` and `stage:'reserved'`.
--   2. The sync action then runs the SAME TypeScript cash tender the live
--      till runs (`startCollection` → `settleAtDoor`): `pos_reserve_collection`
--      answers `already` for that key, the `booking_transactions` cash row is
--      inserted and walked to `paid`, and `pos_settle_collection_reservation`
--      binds the claim to it.
--   3. `pos_outbox_settle` stamps `applied_at` — and it REFUSES unless the
--      reservation row for that operation key is `settled`, so an outbox row
--      can only say "applied" when the database itself says the cash landed.
--
-- A second sync of the same key returns `already` with `stage` so the action
-- knows whether to finish the settle (stage 'reserved') or do nothing
-- (stage 'settled'). Not-replayable commands are still recorded terminally.

BEGIN;

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
  v_order_id uuid;
  v_amount bigint;
  v_reserve jsonb;
  v_row public.pos_outbox%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_device_id IS NULL OR char_length(v_key) < 8 OR p_command IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  -- Lock the device FIRST so operation_key idempotency is checked under a
  -- lock a concurrent caller for the same device actually waits on
  -- (20261231230000).
  SELECT * INTO v_device FROM public.pos_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.tenant_id IS DISTINCT FROM p_tenant_id OR v_device.status = 'disabled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_device');
  END IF;

  SELECT * INTO v_existing
    FROM public.pos_outbox
   WHERE tenant_id = p_tenant_id AND operation_key = v_key;
  IF FOUND THEN
    IF COALESCE((v_existing.result->>'ok')::boolean, true) IS FALSE THEN
      -- A terminal refusal (not_replayable) stays refused.
      RETURN jsonb_build_object(
        'ok', false,
        'already', true,
        'reason', COALESCE(v_existing.result->>'reason', 'not_replayable'),
        'id', v_existing.id
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'id', v_existing.id,
      'stage', CASE WHEN v_existing.applied_at IS NULL THEN 'reserved' ELSE 'settled' END,
      'order_id', v_existing.command->>'order_id',
      'amount_cents', (v_existing.command->>'amount_cents')::bigint,
      'result', v_existing.result
    );
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

  -- The shape is snake_case. A camelCase command (the pre-fix client) is
  -- refused `invalid` rather than guessed at: the sync action normalises
  -- legacy localStorage rows before they get here.
  BEGIN
    v_order_id := NULLIF(p_command->>'order_id', '')::uuid;
    v_amount := COALESCE((p_command->>'amount_cents')::bigint, 0);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END;
  IF v_order_id IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  v_reserve := public.pos_reserve_collection(
    p_tenant_id,
    v_order_id,
    v_key,
    v_amount,
    'cash',
    COALESCE(v_device.registered_by, p_tenant_id),
    NULL,
    900
  );
  IF (v_reserve->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_reserve->>'reason', 'unavailable'));
  END IF;

  INSERT INTO public.pos_outbox (tenant_id, device_id, command, operation_key, applied_at, result)
  VALUES (
    p_tenant_id, p_device_id, p_command, v_key, NULL,
    jsonb_build_object('ok', true, 'stage', 'reserved', 'reservation', v_reserve)
  )
  RETURNING * INTO v_row;
  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'id', v_row.id,
    'stage', 'reserved',
    'order_id', v_order_id,
    'amount_cents', v_amount,
    'result', v_row.result
  );
END;
$$;

-- Stamp an outbox row applied, ONLY once SQL says the cash landed.
CREATE OR REPLACE FUNCTION public.pos_outbox_settle(
  p_tenant_id uuid,
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_outbox%ROWTYPE;
  v_res public.order_collection_reservations%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_row FROM public.pos_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_row.applied_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'id', v_row.id, 'result', v_row.result);
  END IF;

  SELECT * INTO v_res
    FROM public.order_collection_reservations
   WHERE tenant_id = p_tenant_id
     AND order_id = NULLIF(v_row.command->>'order_id', '')::uuid
     AND operation_key = v_row.operation_key;
  IF NOT FOUND OR v_res.state IS DISTINCT FROM 'settled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_settled',
      'state', COALESCE(v_res.state, 'missing')
    );
  END IF;

  UPDATE public.pos_outbox
     SET applied_at = now(),
         result = COALESCE(result, '{}'::jsonb)
                  || jsonb_build_object(
                       'ok', true,
                       'stage', 'settled',
                       'reservation_id', v_res.id,
                       'transaction_id', v_res.transaction_id
                     )
   WHERE id = v_row.id
   RETURNING * INTO v_row;
  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'id', v_row.id,
    'transaction_id', v_res.transaction_id,
    'result', v_row.result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_outbox_apply(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_outbox_apply(uuid, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.pos_outbox_settle(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_outbox_settle(uuid, uuid) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_outbox_apply(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_outbox_apply(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pos_outbox_settle(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_outbox_settle(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos outbox is executable by anon or authenticated';
  END IF;
END
$check$;

-- PROOF. A proof tenant, one device, one 3000-cent draft sale.
DO $proof$
DECLARE
  v_tenant   uuid;
  v_device   uuid;
  v_order    uuid;
  v_shell    uuid;
  v_txn      uuid;
  v_key      text := 'a4-proof:' || substr(gen_random_uuid()::text, 1, 12);
  v_apply    jsonb;
  v_again    jsonb;
  v_settle   jsonb;
  v_camel    jsonb;
  v_card     jsonb;
  v_applied  timestamptz;
  v_state    text;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('a4-proof-' || substr(gen_random_uuid()::text, 1, 12), 'A4 outbox proof')
  RETURNING id INTO v_tenant;

  INSERT INTO public.pos_devices (tenant_id, device_key, name, kind)
  VALUES (v_tenant, 'a4-proof-device-key', 'A4 proof till', 'tablet')
  RETURNING id INTO v_device;

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id
  ) VALUES (
    v_tenant, 'draft', 'USD', 3000, 0, 0, 3000, 'pos', 'a4-proof-guest'
  ) RETURNING id INTO v_order;

  -- CLAIM 1: the camelCase shape the old client sent is refused `invalid`,
  -- and leaves no outbox row and no reservation.
  v_camel := public.pos_outbox_apply(
    v_tenant, v_device, v_key || ':camel',
    jsonb_build_object('kind', 'cash_collect', 'amountCents', 3000, 'orderId', v_order)
  );
  IF v_camel->>'reason' IS DISTINCT FROM 'invalid' THEN
    RAISE EXCEPTION 'A4 proof: camelCase command should be invalid, got %', v_camel;
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_collection_reservations WHERE order_id = v_order) THEN
    RAISE EXCEPTION 'A4 proof: an invalid command reserved money';
  END IF;

  -- CLAIM 2: the contract shape reserves under the operation key and the
  -- outbox row is NOT yet applied.
  v_apply := public.pos_outbox_apply(
    v_tenant, v_device, v_key,
    jsonb_build_object('kind', 'cash_collect', 'method', 'cash', 'order_id', v_order, 'amount_cents', 3000)
  );
  IF COALESCE((v_apply->>'ok')::boolean, false) IS NOT TRUE
     OR v_apply->>'stage' IS DISTINCT FROM 'reserved'
     OR COALESCE((v_apply->>'already')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'A4 proof: expected a fresh reserved apply, got %', v_apply;
  END IF;
  SELECT applied_at INTO v_applied FROM public.pos_outbox WHERE id = (v_apply->>'id')::uuid;
  IF v_applied IS NOT NULL THEN
    RAISE EXCEPTION 'A4 proof: applied_at stamped before anything settled';
  END IF;
  SELECT state INTO v_state
    FROM public.order_collection_reservations
   WHERE order_id = v_order AND operation_key = v_key;
  IF v_state IS DISTINCT FROM 'reserved' THEN
    RAISE EXCEPTION 'A4 proof: expected a reserved claim under the outbox key, got %', COALESCE(v_state, 'none');
  END IF;

  -- CLAIM 3: settle is refused while the claim is only reserved.
  v_settle := public.pos_outbox_settle(v_tenant, (v_apply->>'id')::uuid);
  IF v_settle->>'reason' IS DISTINCT FROM 'not_settled' THEN
    RAISE EXCEPTION 'A4 proof: outbox settled before the reservation did: %', v_settle;
  END IF;

  -- CLAIM 4: a second apply of the same key says already + reserved (so the
  -- action finishes the settle instead of reserving twice).
  v_again := public.pos_outbox_apply(
    v_tenant, v_device, v_key,
    jsonb_build_object('kind', 'cash_collect', 'method', 'cash', 'order_id', v_order, 'amount_cents', 3000)
  );
  IF COALESCE((v_again->>'already')::boolean, false) IS NOT TRUE
     OR v_again->>'stage' IS DISTINCT FROM 'reserved'
     OR (v_again->>'id') <> (v_apply->>'id') THEN
    RAISE EXCEPTION 'A4 proof: replayed key did not return already/reserved: %', v_again;
  END IF;
  IF (SELECT count(*) FROM public.order_collection_reservations WHERE order_id = v_order) <> 1 THEN
    RAISE EXCEPTION 'A4 proof: replay made a second reservation';
  END IF;

  -- The money row, exactly as settleAtDoor writes it, then the claim binds to it.
  INSERT INTO public.agency_bookings (
    tenant_id, tenant_id_snapshot, order_id, title, status, currency_code, total_client_revenue
  ) VALUES (
    v_tenant, v_tenant, v_order, 'A4 proof order shell', 'confirmed', 'USD', 30
  ) RETURNING id INTO v_shell;
  INSERT INTO public.booking_transactions (
    booking_id, order_id, source_tenant_id, gross_amount_cents, net_amount_cents,
    platform_fee_basis_points, platform_fee_cents, currency, provider, provider_reference, status
  ) VALUES (
    v_shell, v_order, v_tenant, 3000, 3000, 0, 0, 'USD', 'manual', v_key, 'draft'
  ) RETURNING id INTO v_txn;
  UPDATE public.booking_transactions SET status = 'payment_requested' WHERE id = v_txn;
  UPDATE public.booking_transactions SET status = 'paid' WHERE id = v_txn;
  v_settle := public.pos_settle_collection_reservation(
    (v_apply->'result'->'reservation'->>'reservation_id')::uuid, v_txn, 'settled'
  );
  IF COALESCE((v_settle->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A4 proof: settling the outbox claim failed: %', v_settle;
  END IF;

  -- CLAIM 5: now the outbox row can be stamped, once, and carries the txn.
  v_settle := public.pos_outbox_settle(v_tenant, (v_apply->>'id')::uuid);
  IF COALESCE((v_settle->>'ok')::boolean, false) IS NOT TRUE
     OR (v_settle->>'transaction_id')::uuid IS DISTINCT FROM v_txn THEN
    RAISE EXCEPTION 'A4 proof: outbox settle after the claim settled failed: %', v_settle;
  END IF;
  SELECT applied_at INTO v_applied FROM public.pos_outbox WHERE id = (v_apply->>'id')::uuid;
  IF v_applied IS NULL THEN
    RAISE EXCEPTION 'A4 proof: applied_at not stamped after settle';
  END IF;
  v_settle := public.pos_outbox_settle(v_tenant, (v_apply->>'id')::uuid);
  IF COALESCE((v_settle->>'already')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A4 proof: second settle was not idempotent: %', v_settle;
  END IF;

  -- CLAIM 6: a third apply of the key now reports stage settled.
  v_again := public.pos_outbox_apply(
    v_tenant, v_device, v_key,
    jsonb_build_object('kind', 'cash_collect', 'method', 'cash', 'order_id', v_order, 'amount_cents', 3000)
  );
  IF v_again->>'stage' IS DISTINCT FROM 'settled' THEN
    RAISE EXCEPTION 'A4 proof: settled key did not report stage settled: %', v_again;
  END IF;

  -- CLAIM 7: a provider command is still not replayable, and stays refused on replay.
  v_card := public.pos_outbox_apply(
    v_tenant, v_device, v_key || ':card',
    jsonb_build_object('kind', 'card_collect', 'provider', 'stripe', 'order_id', v_order, 'amount_cents', 100)
  );
  IF v_card->>'reason' IS DISTINCT FROM 'not_replayable' THEN
    RAISE EXCEPTION 'A4 proof: card command was replayable: %', v_card;
  END IF;
  v_card := public.pos_outbox_apply(
    v_tenant, v_device, v_key || ':card',
    jsonb_build_object('kind', 'card_collect', 'provider', 'stripe', 'order_id', v_order, 'amount_cents', 100)
  );
  IF v_card->>'reason' IS DISTINCT FROM 'not_replayable' OR COALESCE((v_card->>'ok')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'A4 proof: replayed card command was not refused: %', v_card;
  END IF;

  -- Clean up. Children first; the agency cascade is not relied on.
  DELETE FROM public.pos_outbox WHERE tenant_id = v_tenant;
  DELETE FROM public.order_collection_reservations WHERE order_id = v_order;
  DELETE FROM public.booking_transactions WHERE booking_id = v_shell;
  DELETE FROM public.agency_bookings WHERE id = v_shell;
  DELETE FROM public.orders WHERE tenant_id = v_tenant;
  DELETE FROM public.pos_devices WHERE tenant_id = v_tenant;
  DELETE FROM public.agencies WHERE id = v_tenant;

  RAISE NOTICE 'A4 proof: camelCase refused, snake_case reserves without stamping, settle refused until the claim is settled, then stamped once with the transaction, replay reports the stage, provider commands stay not_replayable.';
END
$proof$;

COMMIT;
