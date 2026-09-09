-- T1-03: two cashiers must not be able to collect the same money twice.
--
-- Timestamp sorts after 20261230002200. Do not use calendar 20260909: this
-- file references public.orders (20261228000142) and the deposit-era index
-- (20260614031530), and a calendar-dated name would sort BEFORE both and break
-- a rebuild from zero. The band is the ordering, not the wall clock.
--
-- THE DEFECT. `lib/pos/collection.ts` computed what is still owed by reading
-- `booking_transactions` and subtracting, with no lock. Two devices on the same
-- tab therefore both read the full balance, both passed the "not more than
-- outstanding" check, and both collected it. A retry did the same thing through
-- a different door: the idempotency key was minted per call, so the second
-- attempt was a second allocation rather than a replay.
--
-- Outstanding is not a number a caller may compute. It is a fact about the
-- order, and only the row lock on the order can produce it truthfully. So it
-- moves in here: `pos_reserve_collection` locks the order, subtracts what is
-- paid AND what is already reserved, and hands back a reservation. Money is
-- claimed before it is taken.
--
-- THE THIRD DEFECT, without which the fix cannot ship. Orders are the money
-- aggregate and outstanding is a SUM over their transactions, but
-- `idx_booking_transactions_booking_active` allows only ONE active non-deposit
-- transaction per booking, and every collection on an order lands on that
-- order's single booking shell. A second cash allocation therefore raised 23505
-- on a real database. The split test never saw it because its fake store has no
-- indexes. The index is relaxed to `order_id IS NULL` so inquiry-backed
-- bookings keep exactly today's guard and order-backed ones are governed by the
-- order instead. 20261228000142 deferred precisely this relaxation to the phase
-- that had Orders; this is that phase.

BEGIN;

-- ── The reservation ledger ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_collection_reservations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  order_id       uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  operation_key  text NOT NULL,
  amount_cents   bigint NOT NULL,
  method         text NOT NULL,
  state          text NOT NULL DEFAULT 'reserved',
  transaction_id uuid REFERENCES public.booking_transactions(id) ON DELETE SET NULL,
  expires_at     timestamptz NOT NULL,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  settled_at     timestamptz,
  CONSTRAINT order_collection_reservations_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT order_collection_reservations_key_shape CHECK (char_length(btrim(operation_key)) BETWEEN 1 AND 200),
  CONSTRAINT order_collection_reservations_method_known CHECK (method IN ('cash', 'online_card', 'terminal')),
  CONSTRAINT order_collection_reservations_state_known CHECK (state IN ('reserved', 'settled', 'released')),
  CONSTRAINT order_collection_reservations_key_uniq UNIQUE (order_id, operation_key)
);

COMMENT ON TABLE public.order_collection_reservations IS
  'T1-03: a claim on part of an order''s outstanding balance, taken under the order row lock before any money is recorded. Live rows (state=reserved, not expired) subtract from outstanding exactly as paid transactions do.';

-- Live reservations are what the outstanding SUM reads on every collection, and
-- the reaper walks the expiry edge. Both are partial because a settled or
-- released row is history and must not slow either path down.
CREATE INDEX IF NOT EXISTS order_collection_reservations_live_idx
  ON public.order_collection_reservations (order_id)
  WHERE state = 'reserved';

CREATE INDEX IF NOT EXISTS order_collection_reservations_expiry_idx
  ON public.order_collection_reservations (expires_at)
  WHERE state = 'reserved';

CREATE INDEX IF NOT EXISTS order_collection_reservations_tenant_idx
  ON public.order_collection_reservations (tenant_id, created_at DESC);

ALTER TABLE public.order_collection_reservations ENABLE ROW LEVEL SECURITY;

-- Staff may LOOK at what their own till has claimed. Nobody signs in and
-- writes one: every write goes through the SECURITY DEFINER functions below,
-- which is the only place the order lock is held.
DROP POLICY IF EXISTS order_collection_reservations_staff_select ON public.order_collection_reservations;
CREATE POLICY order_collection_reservations_staff_select ON public.order_collection_reservations
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON public.order_collection_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_collection_reservations TO authenticated;
GRANT ALL ON public.order_collection_reservations TO service_role;

-- ── Relax the one-active-transaction index for order-backed money ───────────

DROP INDEX IF EXISTS public.idx_booking_transactions_booking_active;

CREATE UNIQUE INDEX idx_booking_transactions_booking_active
  ON public.booking_transactions USING btree (booking_id)
  WHERE (
    order_id IS NULL
    AND status <> ALL (ARRAY['cancelled'::text, 'failed'::text, 'refunded'::text])
    AND NOT (
      checkout_type = 'deposit'
      AND status = ANY (ARRAY['paid'::text, 'payout_pending'::text, 'payout_sent'::text, 'payout'::text])
    )
  );

COMMENT ON INDEX public.idx_booking_transactions_booking_active IS
  'One live charge per INQUIRY-BACKED booking, unchanged since 20260614031530. Order-backed transactions are excluded: the order is their aggregate and public.pos_reserve_collection is their guard, so a split tab is many rows on one shell by design.';

-- ── pos_reserve_collection: the only place outstanding is computed ──────────

CREATE OR REPLACE FUNCTION public.pos_reserve_collection(
  p_tenant_id        uuid,
  p_order_id         uuid,
  p_operation_key    text,
  p_amount_cents     bigint,
  p_method           text,
  p_actor_id         uuid,
  p_expected_version integer,
  p_ttl_seconds      integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_key         text;
  v_existing    public.order_collection_reservations%ROWTYPE;
  v_paid        bigint := 0;
  v_reserved    bigint := 0;
  v_uncollected bigint := 0;
  v_outstanding bigint := 0;
  v_amount      bigint;
  v_version     integer;
  v_ttl         integer;
  v_row         public.order_collection_reservations%ROWTYPE;
BEGIN
  v_key := btrim(COALESCE(p_operation_key, ''));
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('cash', 'online_card', 'terminal') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  -- The lock. Everything below reads a balance that cannot move under it.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  -- REPLAY IS ANSWERED BEFORE THE STATE CHECK, and that ordering is the whole
  -- point of an idempotency key. The cashier whose network dropped retries
  -- AFTER the first attempt closed the sale, so by then the order is `paid`
  -- and a not_open refusal would tell a till that already took the money that
  -- the money was never taken. Tenant is checked first; nothing else may be.
  SELECT * INTO v_existing
    FROM public.order_collection_reservations
   WHERE order_id = p_order_id AND operation_key = v_key;
  IF FOUND THEN
    SELECT COALESCE(SUM(t.gross_amount_cents), 0) INTO v_paid
      FROM public.booking_transactions t
     WHERE t.order_id = p_order_id
       AND t.refund_of_transaction_id IS NULL
       AND t.status = ANY (ARRAY['paid', 'payout_pending', 'payout_sent', 'payout']);
    SELECT COALESCE(SUM(r.amount_cents), 0) INTO v_reserved
      FROM public.order_collection_reservations r
     WHERE r.order_id = p_order_id AND r.state = 'reserved' AND r.expires_at > now();
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'reservation_id', v_existing.id,
      'state', v_existing.state,
      'transaction_id', v_existing.transaction_id,
      'amount_cents', v_existing.amount_cents,
      'outstanding_cents', GREATEST(0, v_order.total_cents - v_paid - v_reserved),
      'version', v_order.version
    );
  END IF;

  IF v_order.status NOT IN ('draft', 'pending_payment') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_open');
  END IF;

  IF p_expected_version IS NOT NULL AND v_order.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_order.version);
  END IF;

  -- Paid is wider than status='paid'. A POS card charge that has entered the
  -- payout states is money already in hand, and counting only 'paid' would
  -- reopen the whole balance the moment a transfer started. Refund rows are
  -- excluded by their parent link; a refunded BASE row leaves the set on its
  -- own status and reopens the balance, which is what a refund means.
  SELECT COALESCE(SUM(t.gross_amount_cents), 0) INTO v_paid
    FROM public.booking_transactions t
   WHERE t.order_id = p_order_id
     AND t.refund_of_transaction_id IS NULL
     AND t.status = ANY (ARRAY['paid', 'payout_pending', 'payout_sent', 'payout']);

  SELECT COALESCE(SUM(r.amount_cents), 0) INTO v_reserved
    FROM public.order_collection_reservations r
   WHERE r.order_id = p_order_id AND r.state = 'reserved' AND r.expires_at > now();

  -- TWO DIFFERENT REFUSALS, and conflating them is how the second cashier gets
  -- told the wrong thing. `already_collected` means the MONEY is all in: paid
  -- covers the total and this sale is finished. `exceeds_outstanding` means
  -- money is still owed but another till has claimed it, which is a "try again
  -- in a moment", not a "this sale is done". So the uncollected balance is
  -- computed first, and reservations are subtracted after.
  v_uncollected := v_order.total_cents - v_paid;
  IF v_uncollected <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_collected', 'outstanding_cents', 0);
  END IF;

  v_outstanding := v_uncollected - v_reserved;

  -- A NULL amount means "whatever is left", resolved HERE under the lock. A
  -- caller that resolved it itself would be reading the stale balance this
  -- function exists to replace.
  IF p_amount_cents IS NOT NULL AND p_amount_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount', 'outstanding_cents', GREATEST(0, v_outstanding));
  END IF;
  v_amount := COALESCE(p_amount_cents, v_outstanding);
  IF v_outstanding <= 0 OR v_amount > v_outstanding THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exceeds_outstanding', 'outstanding_cents', GREATEST(0, v_outstanding));
  END IF;

  v_ttl := GREATEST(30, LEAST(COALESCE(p_ttl_seconds, 900), 86400));

  INSERT INTO public.order_collection_reservations (
    tenant_id, order_id, operation_key, amount_cents, method, state, expires_at, created_by
  ) VALUES (
    p_tenant_id, p_order_id, v_key, v_amount, p_method, 'reserved',
    now() + make_interval(secs => v_ttl), p_actor_id
  )
  RETURNING * INTO v_row;

  -- The version bump is what makes a second device's stale expected_version a
  -- conflict rather than a second collection.
  UPDATE public.orders
     SET version = v_order.version + 1
   WHERE id = p_order_id
     AND version = v_order.version;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'reservation_id', v_row.id,
    'state', v_row.state,
    'transaction_id', NULL,
    'amount_cents', v_row.amount_cents,
    'outstanding_cents', v_outstanding - v_amount,
    'expires_at', v_row.expires_at,
    'version', v_order.version + 1
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Same key, two connections. The loser reads the winner's row rather than
    -- reporting a fault: an idempotent call has one right answer.
    SELECT * INTO v_existing
      FROM public.order_collection_reservations
     WHERE order_id = p_order_id AND operation_key = v_key;
    IF FOUND THEN
      -- Recomputed rather than left null: a caller that has to guess what is
      -- still owed is the defect this function replaces.
      SELECT COALESCE(SUM(t.gross_amount_cents), 0) INTO v_paid
        FROM public.booking_transactions t
       WHERE t.order_id = p_order_id
         AND t.refund_of_transaction_id IS NULL
         AND t.status = ANY (ARRAY['paid', 'payout_pending', 'payout_sent', 'payout']);
      SELECT COALESCE(SUM(r.amount_cents), 0) INTO v_reserved
        FROM public.order_collection_reservations r
       WHERE r.order_id = p_order_id AND r.state = 'reserved' AND r.expires_at > now();
      SELECT version INTO v_version FROM public.orders WHERE id = p_order_id;
      RETURN jsonb_build_object(
        'ok', true,
        'already', true,
        'reservation_id', v_existing.id,
        'state', v_existing.state,
        'transaction_id', v_existing.transaction_id,
        'amount_cents', v_existing.amount_cents,
        'outstanding_cents', GREATEST(0, v_order.total_cents - v_paid - v_reserved),
        'version', v_version
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_reserve_collection(uuid, uuid, text, bigint, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_reserve_collection(uuid, uuid, text, bigint, text, uuid, integer, integer) TO service_role;

COMMENT ON FUNCTION public.pos_reserve_collection(uuid, uuid, text, bigint, text, uuid, integer, integer) IS
  'T1-03: lock the order, replay by (order_id, operation_key), and claim part of the outstanding balance. Outstanding is total minus paid transactions minus live reservations. Refusals are data.';

-- ── pos_settle_collection_reservation: compare-and-set on reserved ──────────

CREATE OR REPLACE FUNCTION public.pos_settle_collection_reservation(
  p_reservation_id uuid,
  p_transaction_id uuid,
  p_state          text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.order_collection_reservations%ROWTYPE;
BEGIN
  IF p_reservation_id IS NULL OR p_state IS NULL OR p_state NOT IN ('settled', 'released') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  UPDATE public.order_collection_reservations
     SET state = p_state,
         transaction_id = COALESCE(p_transaction_id, transaction_id),
         settled_at = now()
   WHERE id = p_reservation_id
     AND state = 'reserved'
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'already', false, 'reservation_id', v_row.id,
      'state', v_row.state, 'transaction_id', v_row.transaction_id
    );
  END IF;

  SELECT * INTO v_row FROM public.order_collection_reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_row.state = p_state THEN
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'reservation_id', v_row.id,
      'state', v_row.state, 'transaction_id', v_row.transaction_id
    );
  END IF;

  -- Settled and released are terminal and NOT interchangeable. A reaper that
  -- released a reservation the till then settled must not be able to un-settle
  -- it, so the mismatch is reported rather than overwritten.
  RETURN jsonb_build_object(
    'ok', false, 'reason', 'not_reserved', 'state', v_row.state,
    'transaction_id', v_row.transaction_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_settle_collection_reservation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_settle_collection_reservation(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.pos_settle_collection_reservation(uuid, uuid, text) IS
  'T1-03: compare-and-set a reservation out of `reserved`. Re-applying the same terminal state is `already`; crossing from one terminal state to the other is refused.';

-- ── reap_collection_reservations: a claim nobody completed is not a claim ───

CREATE OR REPLACE FUNCTION public.reap_collection_reservations(
  p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[] := '{}';
BEGIN
  WITH doomed AS (
    SELECT id
      FROM public.order_collection_reservations
     WHERE state = 'reserved'
       AND expires_at <= now()
     ORDER BY expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))
     FOR UPDATE SKIP LOCKED
  ), released AS (
    UPDATE public.order_collection_reservations r
       SET state = 'released', settled_at = now()
      FROM doomed d
     WHERE r.id = d.id
       AND r.state = 'reserved'
    RETURNING r.id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO v_ids FROM released;

  RETURN jsonb_build_object('ok', true, 'released', COALESCE(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids));
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.reap_collection_reservations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_collection_reservations(integer) TO service_role;

COMMENT ON FUNCTION public.reap_collection_reservations(integer) IS
  'T1-03: release reservations whose TTL lapsed, SKIP LOCKED so a live collection is never blocked by the sweep. An unreaped reservation is money nobody can collect.';

-- ── The grants must actually have taken ─────────────────────────────────────

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_reserve_collection(uuid,uuid,text,bigint,text,uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_reserve_collection(uuid,uuid,text,bigint,text,uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pos_settle_collection_reservation(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_settle_collection_reservation(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reap_collection_reservations(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reap_collection_reservations(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T1-03: the collection reservation RPCs are executable by anon/authenticated; the REVOKE did not take';
  END IF;

  IF has_table_privilege('anon', 'public.order_collection_reservations', 'SELECT')
     OR has_table_privilege('anon', 'public.order_collection_reservations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.order_collection_reservations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.order_collection_reservations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.order_collection_reservations', 'DELETE') THEN
    RAISE EXCEPTION 'T1-03: order_collection_reservations is writable by anon/authenticated';
  END IF;
END
$check$;

-- ── PROOF. Runs on every apply and cleans up after itself. ──────────────────
--
-- Four claims, none of them taken on trust:
--   1. two PAID transactions coexist on one order-backed booking shell;
--   2. a second live transaction on an inquiry-backed shell still raises 23505;
--   3. a second reservation for money already claimed is refused, and says how
--      much is actually left;
--   4. the same operation key twice is one reservation, not two.

DO $proof$
DECLARE
  v_tenant           uuid;
  v_order            uuid;
  v_shell_order      uuid;
  v_shell_inquiry    uuid;
  v_txn_a            uuid;
  v_txn_b            uuid;
  v_txn_c            uuid;
  v_paid_rows        integer;
  v_inquiry_refused  boolean := false;
  v_first            jsonb;
  v_second           jsonb;
  v_replay           jsonb;
  v_settled          jsonb;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('t1-03-proof-' || substr(gen_random_uuid()::text, 1, 12), 'T1-03 collection proof')
  RETURNING id INTO v_tenant;

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id
  ) VALUES (
    v_tenant, 'draft', 'USD', 9000, 0, 0, 9000, 'pos', 't1-03-proof-guest'
  ) RETURNING id INTO v_order;

  -- The order's ONE booking shell, exactly as lib/orders/booking-shell.ts makes it.
  INSERT INTO public.agency_bookings (
    tenant_id, tenant_id_snapshot, order_id, title, status, currency_code, total_client_revenue
  ) VALUES (
    v_tenant, v_tenant, v_order, 'T1-03 proof order shell', 'confirmed', 'USD', 90
  ) RETURNING id INTO v_shell_order;

  -- CLAIM 1: two cash allocations on that one shell both reach `paid`.
  INSERT INTO public.booking_transactions (
    booking_id, order_id, source_tenant_id, gross_amount_cents, net_amount_cents,
    currency, provider, provider_reference, status
  ) VALUES (
    v_shell_order, v_order, v_tenant, 3000, 3000, 'USD', 'manual', 't1-03-proof:a', 'draft'
  ) RETURNING id INTO v_txn_a;
  UPDATE public.booking_transactions SET status = 'payment_requested' WHERE id = v_txn_a;
  UPDATE public.booking_transactions SET status = 'paid' WHERE id = v_txn_a;

  INSERT INTO public.booking_transactions (
    booking_id, order_id, source_tenant_id, gross_amount_cents, net_amount_cents,
    currency, provider, provider_reference, status
  ) VALUES (
    v_shell_order, v_order, v_tenant, 3000, 3000, 'USD', 'manual', 't1-03-proof:b', 'draft'
  ) RETURNING id INTO v_txn_b;
  UPDATE public.booking_transactions SET status = 'payment_requested' WHERE id = v_txn_b;
  UPDATE public.booking_transactions SET status = 'paid' WHERE id = v_txn_b;

  SELECT count(*) INTO v_paid_rows
    FROM public.booking_transactions
   WHERE order_id = v_order AND status = 'paid';
  IF v_paid_rows <> 2 THEN
    RAISE EXCEPTION 'T1-03 proof: expected 2 paid rows on one order-backed shell, found %', v_paid_rows;
  END IF;

  -- CLAIM 2: an inquiry-backed shell (order_id IS NULL on the money row) keeps
  -- exactly today's one-live-charge rule.
  INSERT INTO public.agency_bookings (
    tenant_id, tenant_id_snapshot, title, status, currency_code, total_client_revenue
  ) VALUES (
    v_tenant, v_tenant, 'T1-03 proof inquiry shell', 'confirmed', 'USD', 50
  ) RETURNING id INTO v_shell_inquiry;

  INSERT INTO public.booking_transactions (
    booking_id, source_tenant_id, gross_amount_cents, net_amount_cents,
    currency, provider, provider_reference, status
  ) VALUES (
    v_shell_inquiry, v_tenant, 5000, 5000, 'USD', 'manual', 't1-03-proof:c', 'draft'
  ) RETURNING id INTO v_txn_c;

  BEGIN
    INSERT INTO public.booking_transactions (
      booking_id, source_tenant_id, gross_amount_cents, net_amount_cents,
      currency, provider, provider_reference, status
    ) VALUES (
      v_shell_inquiry, v_tenant, 5000, 5000, 'USD', 'manual', 't1-03-proof:d', 'draft'
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_inquiry_refused := true;
  END;

  IF NOT v_inquiry_refused THEN
    RAISE EXCEPTION 'T1-03 proof: a second live transaction on an inquiry-backed booking was ACCEPTED; the relaxed index is too wide';
  END IF;

  -- CLAIM 3: 6000 is paid, so 3000 is left. Claim it, then try to claim a cent
  -- more on a different key.
  v_first := public.pos_reserve_collection(
    v_tenant, v_order, 't1-03-proof:res-1', 3000, 'cash', NULL, NULL, 900
  );
  IF COALESCE((v_first->>'ok')::boolean, false) IS NOT TRUE
     OR (v_first->>'outstanding_cents')::bigint <> 0 THEN
    RAISE EXCEPTION 'T1-03 proof: the first reservation did not take the remaining 3000: %', v_first;
  END IF;

  v_second := public.pos_reserve_collection(
    v_tenant, v_order, 't1-03-proof:res-2', 1, 'cash', NULL, NULL, 900
  );
  IF COALESCE((v_second->>'ok')::boolean, true) IS NOT FALSE
     OR v_second->>'reason' <> 'exceeds_outstanding'
     OR (v_second->>'outstanding_cents')::bigint <> 0 THEN
    RAISE EXCEPTION 'T1-03 proof: a second cashier was allowed to claim money already reserved: %', v_second;
  END IF;

  -- CLAIM 4: the same key twice is one reservation.
  v_replay := public.pos_reserve_collection(
    v_tenant, v_order, 't1-03-proof:res-1', 3000, 'cash', NULL, NULL, 900
  );
  IF COALESCE((v_replay->>'already')::boolean, false) IS NOT TRUE
     OR (v_replay->>'reservation_id') <> (v_first->>'reservation_id') THEN
    RAISE EXCEPTION 'T1-03 proof: a replayed operation key produced a second reservation: %', v_replay;
  END IF;

  SELECT count(*) INTO v_paid_rows
    FROM public.order_collection_reservations WHERE order_id = v_order;
  IF v_paid_rows <> 1 THEN
    RAISE EXCEPTION 'T1-03 proof: expected exactly 1 reservation row, found %', v_paid_rows;
  END IF;

  v_settled := public.pos_settle_collection_reservation(
    (v_first->>'reservation_id')::uuid, v_txn_a, 'settled'
  );
  IF COALESCE((v_settled->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'T1-03 proof: settling a live reservation failed: %', v_settled;
  END IF;

  v_settled := public.pos_settle_collection_reservation(
    (v_first->>'reservation_id')::uuid, v_txn_a, 'released'
  );
  IF COALESCE((v_settled->>'ok')::boolean, true) IS NOT FALSE
     OR v_settled->>'reason' <> 'not_reserved' THEN
    RAISE EXCEPTION 'T1-03 proof: a settled reservation was allowed to be released: %', v_settled;
  END IF;

  -- Clean up. Children first; the agency cascade is not relied on.
  DELETE FROM public.order_collection_reservations WHERE order_id = v_order;
  DELETE FROM public.booking_transactions WHERE booking_id IN (v_shell_order, v_shell_inquiry);
  DELETE FROM public.agency_bookings WHERE id IN (v_shell_order, v_shell_inquiry);
  DELETE FROM public.orders WHERE tenant_id = v_tenant;
  DELETE FROM public.agencies WHERE id = v_tenant;

  RAISE NOTICE 'T1-03 proof: 2 paid rows on one order shell, inquiry shell still refuses a second, reservation guards the balance, replay is one row.';
END
$proof$;

COMMIT;
