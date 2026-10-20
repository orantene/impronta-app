-- admission_exchange: price per UNIT, pay before move, capacity moves (TUL-1435).
--
-- THREE DEFECTS in 20261231232000, all on one function:
--   1. The "old price" was the order line's total_cents. A line of 4 tickets at
--      25.00 reads as 100.00, so moving ONE ticket to a 30.00 night looked like
--      a price DROP (a refund intent for the whole line) and to a 120.00 night
--      looked like +20.00 instead of +95.00. The old price is the line's price
--      PER TICKET (total_cents / units).
--   2. On the more-expensive path it moved the ticket and bumped token_version
--      BEFORE anything was paid, then returned ok:false. The guest's old code
--      was already dead and the ticket sat on a night nobody paid for. Now that
--      path changes NOTHING and returns price_up_needs_payment with the amount;
--      the move happens only on a call that owes nothing more.
--   3. It never moved capacity: the seat stayed charged to the old night's
--      pool. Now the seat is reserved on the target night first (sold_out
--      refuses, nothing moves), committed to the order line, the admission
--      points at it, and the old allocation is released. Same shape as
--      session_move_participant (20261231217000).
--
-- THE REFUND IS NOW A STATED AMOUNT. The cheaper path writes a
-- ticket_refund_intents row naming the admission and the difference
-- (refund_cents). The executor cron refunds exactly that and voids nothing;
-- it used to refund and void the whole line.
--
-- CONTRACT: same signature, same return keys. Added keys only (amount_cents on
-- price_up_needs_payment already existed; line_id is no longer returned because
-- no balance line is created for an unpaid difference). New refusal words:
-- sold_out, refund_pending. ADDITIVE column only; the TS executor reads the
-- column with select("*"), so code ships first and works before this applies
-- (an exchange intent without refund_cents is HELD for a person, never refunded
-- in full).
--
-- NOT APPLIED BY THE PR. Needs Oran's explicit OK to run against the database.

BEGIN;

ALTER TABLE public.ticket_refund_intents
  ADD COLUMN IF NOT EXISTS refund_cents bigint;

COMMENT ON COLUMN public.ticket_refund_intents.refund_cents IS
  'admission_exchange only: the price difference owed for ONE ticket, in minor units. The executor refunds exactly this and voids no ticket. NULL for every other reason (whole-line or per-holder refunds derive their amount).';

CREATE OR REPLACE FUNCTION public.admission_exchange(
  p_tenant_id uuid,
  p_admission_id uuid,
  p_to_session_id uuid,
  p_operation_key text,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_adm public.admissions%ROWTYPE;
  v_to public.sessions%ROWTYPE;
  v_old_cents bigint := 0;
  v_new_cents bigint := 0;
  v_delta bigint;
  v_pool uuid;
  v_reserve jsonb;
  v_alloc uuid;
  v_party int;
BEGIN
  IF p_tenant_id IS NULL OR p_admission_id IS NULL OR p_to_session_id IS NULL OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_adm FROM public.admissions WHERE id = p_admission_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_adm.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF p_expected_version IS NOT NULL AND v_adm.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;
  IF v_adm.session_id IS NOT DISTINCT FROM p_to_session_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'same_session');
  END IF;
  IF v_adm.status IS DISTINCT FROM 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_to FROM public.sessions WHERE id = p_to_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  -- OLD PRICE = what THIS ticket cost: the line's total over its units.
  IF v_adm.order_line_id IS NOT NULL THEN
    SELECT (ol.total_cents / GREATEST(1, COALESCE(ol.units, 1)))::bigint
      INTO v_old_cents
      FROM public.order_lines ol WHERE ol.id = v_adm.order_line_id;
  END IF;
  v_old_cents := COALESCE(v_old_cents, v_adm.door_amount_cents, 0);

  SELECT COALESCE(tov.amount_cents, o.amount_cents, 0) INTO v_new_cents
    FROM public.sessions s
    LEFT JOIN public.talent_offerings o ON o.id = s.offering_id
    LEFT JOIN public.talent_offering_variants tov
      ON tov.offering_id = s.offering_id
   WHERE s.id = p_to_session_id
   ORDER BY tov.sort_order NULLS LAST
   LIMIT 1;
  v_new_cents := COALESCE(v_new_cents, 0);
  v_delta := v_new_cents - v_old_cents;

  -- PAY BEFORE MOVE. A dearer night changes nothing: no move, no token bump, no
  -- seat. The caller collects v_delta and exchanges again.
  IF v_delta > 0 AND v_adm.order_line_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'price_up_needs_payment',
      'amount_cents', v_delta, 'id', v_adm.id
    );
  END IF;

  -- A refund already queued for this line would swallow this one (one intent
  -- per line). Refuse the exchange rather than move a ticket whose refund is lost.
  IF v_delta < 0 AND v_adm.order_line_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.ticket_refund_intents WHERE order_line_id = v_adm.order_line_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'refund_pending');
  END IF;

  -- CAPACITY MOVES WITH THE TICKET: reserve the target night first.
  IF v_adm.allocation_id IS NOT NULL THEN
    SELECT cp.id INTO v_pool
      FROM public.capacity_pools cp
     WHERE cp.tenant_id = p_tenant_id
       AND cp.subject_kind = 'session_tier'
       AND cp.subject_id = v_to.id
       AND cp.is_active
     ORDER BY cp.created_at
     LIMIT 1;
    IF v_pool IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'sold_out'); END IF;

    v_party := GREATEST(1, COALESCE(v_adm.party_size, 1));
    v_reserve := public.reserve_resource_set_v2(
      p_tenant_id,
      v_key,
      NULL,
      900,
      jsonb_build_array(
        jsonb_build_object(
          'pool_id', v_pool,
          'units', v_party,
          'starts_at', v_to.starts_at,
          'ends_at', v_to.ends_at
        )
      ),
      '[]'::jsonb
    );
    IF (v_reserve->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'sold_out');
    END IF;
    IF jsonb_typeof(v_reserve->'allocation_ids') = 'array'
       AND jsonb_array_length(v_reserve->'allocation_ids') > 0 THEN
      v_alloc := (v_reserve->'allocation_ids'->>0)::uuid;
    END IF;
    IF v_alloc IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'sold_out'); END IF;
    IF v_adm.order_line_id IS NOT NULL THEN
      PERFORM public.commit_capacity(ARRAY[v_alloc], v_adm.order_line_id);
    END IF;
  END IF;

  UPDATE public.admissions
     SET session_id = p_to_session_id,
         allocation_id = COALESCE(v_alloc, allocation_id),
         starts_at = v_to.starts_at,
         version = version + 1,
         token_version = token_version + 1,
         updated_at = now()
   WHERE id = v_adm.id;

  IF v_alloc IS NOT NULL THEN
    PERFORM public.release_capacity(ARRAY[v_adm.allocation_id]);
  END IF;

  IF v_delta < 0 AND v_adm.order_line_id IS NOT NULL THEN
    INSERT INTO public.ticket_refund_intents (
      tenant_id, order_id, order_line_id, reason, requested_by_admission_id, refund_cents
    )
    SELECT ol.tenant_id, ol.order_id, ol.id, 'admission_exchange', v_adm.id, -v_delta
      FROM public.order_lines ol WHERE ol.id = v_adm.order_line_id
    ON CONFLICT (order_line_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_adm.id,
    'delta_cents', v_delta,
    'version', v_adm.version + 1,
    'token_version', v_adm.token_version + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admission_exchange(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_exchange(uuid, uuid, uuid, text, integer) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.admission_exchange(uuid,uuid,uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'admission_exchange is executable by anon';
  END IF;
END
$check$;

COMMIT;
