-- admission_exchange: price per UNIT, pay before move, capacity moves (TUL-1435).
--
-- FIVE DEFECTS in 20261231232000, all on one function:
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
--   4. (TUL-1452 P1) Only the admission was locked and the intent insert was
--      ON CONFLICT DO NOTHING: two exchanges on one line, or a guest refund
--      request racing an exchange, could move the ticket and lose its refund.
--      The ORDER LINE is now locked FOR UPDATE for the whole exchange (after
--      the admission: same lock order as every other writer), and an intent
--      insert that returns no row raises inside a sub-block whose handler
--      rolls the seat, the move and the release back and answers
--      refund_pending.
--   5. (TUL-1452 P1) The target was priced by "the first variant by
--      sort_order" of whatever the session sold. Now the target night must be
--      the SAME offering, in the ORDER's currency, and the price is the line's
--      own tier (variant) on that offering; the seat comes from that tier's
--      pool (pool_key). Refusals: different_offering, currency_mismatch,
--      tier_mismatch. Nothing moves on a refusal.
--
-- THE REFUND IS NOW A STATED AMOUNT. The cheaper path writes a
-- ticket_refund_intents row naming the admission and the difference
-- (refund_cents). The executor cron refunds exactly that and voids nothing;
-- it used to refund and void the whole line.
--
-- CONTRACT: same signature, same return keys. Added keys only (amount_cents on
-- price_up_needs_payment already existed; line_id is no longer returned because
-- no balance line is created for an unpaid difference). New refusal words:
-- sold_out, refund_pending, different_offering, currency_mismatch,
-- tier_mismatch. ADDITIVE column only; the TS executor reads the
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
  v_line public.order_lines%ROWTYPE;
  v_from_offering uuid;
  v_order_currency text;
  v_offering_currency text;
  v_offering_cents bigint;
  v_tier_cents bigint;
  v_pool_key text;
  v_old_cents bigint := 0;
  v_new_cents bigint := 0;
  v_delta bigint;
  v_pool uuid;
  v_reserve jsonb;
  v_alloc uuid;
  v_party int;
  v_intent uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_admission_id IS NULL OR p_to_session_id IS NULL OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  -- LOCK ORDER: admission, then its order line. The same order every other
  -- writer takes (refund_admission and the cancel cascade lock admissions; the
  -- intent insert takes the line's FK key-share), so this cannot deadlock them.
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

  -- THE LINE IS HELD FOR THE WHOLE EXCHANGE (TUL-1452 P1). Locking only the
  -- admission let two exchanges on one line (or a guest refund request racing
  -- an exchange) both see "no intent yet", both move, and the second refund was
  -- swallowed by ON CONFLICT DO NOTHING after its ticket had moved. FOR UPDATE,
  -- not NO KEY UPDATE: it also conflicts with the FK key-share a concurrent
  -- ticket_refund_intents insert takes on this row, so that insert waits for
  -- this transaction and then reads already_requested.
  IF v_adm.order_line_id IS NOT NULL THEN
    SELECT * INTO v_line FROM public.order_lines ol WHERE ol.id = v_adm.order_line_id
       FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  END IF;

  SELECT * INTO v_to FROM public.sessions WHERE id = p_to_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  -- SAME OFFERING, SAME CURRENCY, SAME TIER (TUL-1452 P1). An exchange moves a
  -- ticket to another night OF THE SAME THING. It used to price the target by
  -- "the first variant by sort_order" of whatever offering the session had, so
  -- a VIP ticket could land on a GA price (or another event's, in another
  -- currency) and the difference was refunded as if it were real.
  v_from_offering := v_line.offering_id;
  IF v_from_offering IS NULL THEN
    SELECT s.offering_id INTO v_from_offering FROM public.sessions s WHERE s.id = v_adm.session_id;
  END IF;
  IF v_to.offering_id IS NULL OR v_from_offering IS NULL
     OR v_to.offering_id IS DISTINCT FROM v_from_offering THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'different_offering');
  END IF;

  SELECT o.currency, o.amount_cents INTO v_offering_currency, v_offering_cents
    FROM public.talent_offerings o WHERE o.id = v_to.offering_id;
  IF v_adm.order_line_id IS NOT NULL THEN
    SELECT ord.currency INTO v_order_currency FROM public.orders ord WHERE ord.id = v_line.order_id;
    IF v_order_currency IS NULL OR v_offering_currency IS NULL
       OR upper(v_order_currency) IS DISTINCT FROM upper(v_offering_currency) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'currency_mismatch');
    END IF;
  END IF;

  IF v_line.variant_id IS NOT NULL THEN
    SELECT tov.amount_cents, tov.pool_key INTO v_tier_cents, v_pool_key
      FROM public.talent_offering_variants tov
     WHERE tov.id = v_line.variant_id AND tov.offering_id = v_to.offering_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'tier_mismatch'); END IF;
    v_new_cents := COALESCE(v_tier_cents, v_offering_cents, 0);
  ELSIF v_adm.order_line_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.talent_offering_variants tov WHERE tov.offering_id = v_to.offering_id) THEN
    -- A paid line with no tier on an offering that HAS tiers: which tier it was
    -- cannot be told, so no price can be trusted. Refuse rather than guess.
    RETURN jsonb_build_object('ok', false, 'reason', 'tier_mismatch');
  ELSE
    v_new_cents := COALESCE(v_offering_cents, 0);
  END IF;

  -- OLD PRICE = what THIS ticket cost: the line's total over its units.
  IF v_adm.order_line_id IS NOT NULL THEN
    v_old_cents := (v_line.total_cents / GREATEST(1, COALESCE(v_line.units, 1)))::bigint;
  END IF;
  v_old_cents := COALESCE(v_old_cents, v_adm.door_amount_cents, 0);
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
  -- per line). Refuse the exchange rather than move a ticket whose refund is
  -- lost. Read under the line lock, so it sees every committed intent.
  IF v_delta < 0 AND v_adm.order_line_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.ticket_refund_intents WHERE order_line_id = v_adm.order_line_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'refund_pending');
  END IF;

  -- Everything below either all happens or none of it does: a failed intent
  -- insert raises, and the handler rolls the reserve, commit, move and release
  -- back to this block's savepoint before answering.
  BEGIN
    -- CAPACITY MOVES WITH THE TICKET: reserve the target night first, from the
    -- pool of the ticket's own tier on that night.
    IF v_adm.allocation_id IS NOT NULL THEN
      SELECT cp.id INTO v_pool
        FROM public.capacity_pools cp
       WHERE cp.tenant_id = p_tenant_id
         AND cp.subject_kind = 'session_tier'
         AND cp.subject_id = v_to.id
         AND cp.is_active
         AND (v_pool_key IS NULL OR cp.pool_key = v_pool_key)
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
      VALUES (v_line.tenant_id, v_line.order_id, v_line.id, 'admission_exchange', v_adm.id, -v_delta)
      ON CONFLICT (order_line_id) DO NOTHING
      RETURNING id INTO v_intent;
      -- No row means another intent owns this line: the difference would never
      -- be refunded. Fail the exchange; the handler undoes the move.
      IF v_intent IS NULL THEN
        RAISE EXCEPTION 'refund_pending';
      END IF;
    END IF;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'refund_pending' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'refund_pending');
      END IF;
      RAISE;
  END;

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
