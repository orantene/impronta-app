-- A5 (audit 2026-09-15): the public ticket picker held seats and then bought
-- without them. `holdTicketSeats` wrote `admission_holds` rows (D-123), but
-- `buy()` never sent the hold ids to `startTicketPurchase`, so the purchase
-- reserved tier capacity on its own and the seat hold simply expired: the
-- guest picked seat A, paid, and owned no seat. `admission_holds` had no
-- 'converted' row anywhere because nothing could write one.
--
-- THE CONSUME PATH. `admission_hold_consume(tenant, hold_ids[], order_id)`
-- binds live holds to the purchase that pays for them, in one transaction:
--
--   * every hold must be this tenant's, `held`, and not yet expired
--     (`hold_expired` otherwise; the whole call refuses, nothing is half
--     bound);
--   * the order must be this tenant's and still open (`draft` /
--     `pending_payment`; `not_open` otherwise);
--   * the hold's expiry is pushed out to the ORDER's own `hold_expires_at`
--     when that is later, and the seat's space allocation (when the seat has
--     a pool) is extended through `extend_capacity_hold` to the same instant,
--     so the seat cannot be reaped while the purchase it belongs to is still
--     payable — the same rule the card claim follows for the checkout session;
--   * the row becomes `converted` with `order_id` set. A second call with the
--     same holds and the same order is `already`; with another order it is
--     `seat_taken`.
--
-- AND THE SEAT STAYS TAKEN. The proof below found that `admission_hold_seats`
-- only looked at `held` rows, so a consumed (converted) seat was holdable by
-- the next guest the moment it was bound. It now treats a converted hold as
-- taken while its order is alive, frees it inline when the order is cancelled
-- or refunded, and `admission_hold_reap` (cron `expire-orders`) also releases
-- converted holds whose order the sweep cancelled. A converted seat is never
-- reaped on its own expiry: its lifetime is the order's.

BEGIN;

CREATE OR REPLACE FUNCTION public.admission_hold_seats(
  p_tenant_id uuid,
  p_session_id uuid,
  p_seat_ids uuid[],
  p_guest_session_id text,
  p_ttl_s integer,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_ttl integer := GREATEST(30, LEAST(COALESCE(p_ttl_s, 180), 3600));
  v_session public.sessions%ROWTYPE;
  v_existing public.admission_holds%ROWTYPE;
  v_seat uuid;
  v_space public.spaces%ROWTYPE;
  v_hold public.admission_holds%ROWTYPE;
  v_pool uuid;
  v_reserve jsonb;
  v_alloc uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_expires timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL OR p_seat_ids IS NULL
     OR cardinality(p_seat_ids) < 1 OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_existing
    FROM public.admission_holds
   WHERE tenant_id = p_tenant_id AND operation_key = v_key
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.status = 'held' AND v_existing.expires_at > now() THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'id', v_existing.id, 'expires_at', v_existing.expires_at);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'hold_expired');
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_expires := now() + make_interval(secs => v_ttl);

  FOREACH v_seat IN ARRAY p_seat_ids LOOP
    SELECT * INTO v_space FROM public.spaces WHERE id = v_seat FOR UPDATE;
    IF NOT FOUND OR v_space.tenant_id IS DISTINCT FROM p_tenant_id OR v_space.kind IS DISTINCT FROM 'seat' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    -- A CONVERTED hold is a seat somebody is paying for, or has paid for. It
    -- is taken for everyone until its order is cancelled or refunded, at which
    -- point the seat is freed here rather than waiting for the reaper.
    SELECT * INTO v_hold
      FROM public.admission_holds
     WHERE session_id = p_session_id AND seat_space_id = v_seat AND status = 'converted'
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
    IF FOUND THEN
      IF v_hold.order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.orders o WHERE o.id = v_hold.order_id AND o.status IN ('cancelled', 'refunded')
      ) THEN
        IF v_hold.allocation_id IS NOT NULL THEN
          PERFORM public.release_capacity(ARRAY[v_hold.allocation_id]);
        END IF;
        UPDATE public.admission_holds SET status = 'released', version = version + 1 WHERE id = v_hold.id;
      ELSE
        RETURN jsonb_build_object('ok', false, 'reason', 'seat_taken');
      END IF;
    END IF;

    SELECT * INTO v_hold
      FROM public.admission_holds
     WHERE session_id = p_session_id AND seat_space_id = v_seat AND status = 'held'
     FOR UPDATE;
    IF FOUND THEN
      IF v_hold.expires_at > now() AND v_hold.guest_session_id IS DISTINCT FROM NULLIF(btrim(COALESCE(p_guest_session_id, '')), '') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'seat_taken');
      END IF;
      IF v_hold.expires_at <= now() THEN
        IF v_hold.allocation_id IS NOT NULL THEN
          PERFORM public.release_capacity(ARRAY[v_hold.allocation_id]);
        END IF;
        UPDATE public.admission_holds SET status = 'released', version = version + 1 WHERE id = v_hold.id;
      ELSIF v_hold.guest_session_id IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_guest_session_id, '')), '') THEN
        v_ids := array_append(v_ids, v_hold.id);
        CONTINUE;
      END IF;
    END IF;

    SELECT cp.id INTO v_pool
      FROM public.capacity_pools cp
     WHERE cp.tenant_id = p_tenant_id
       AND cp.subject_kind = 'space'
       AND cp.subject_id = v_seat
     ORDER BY cp.created_at
     LIMIT 1;

    v_alloc := NULL;
    IF v_pool IS NOT NULL THEN
      v_reserve := public.reserve_resource_set_v2(
        p_tenant_id,
        v_key || ':' || v_seat::text,
        NULL,
        v_ttl,
        jsonb_build_array(
          jsonb_build_object(
            'pool_id', v_pool,
            'units', 1,
            'starts_at', v_session.starts_at,
            'ends_at', v_session.ends_at
          )
        ),
        '[]'::jsonb
      );
      IF (v_reserve->>'ok')::boolean IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'seat_taken');
      END IF;
      IF jsonb_typeof(v_reserve->'allocation_ids') = 'array'
         AND jsonb_array_length(v_reserve->'allocation_ids') > 0 THEN
        v_alloc := (v_reserve->'allocation_ids'->>0)::uuid;
      END IF;
    END IF;

    BEGIN
      INSERT INTO public.admission_holds (
        tenant_id, session_id, seat_space_id, guest_session_id, expires_at,
        allocation_id, status, operation_key
      ) VALUES (
        p_tenant_id, p_session_id, v_seat, NULLIF(btrim(COALESCE(p_guest_session_id, '')), ''),
        v_expires, v_alloc, 'held', v_key
      )
      RETURNING * INTO v_hold;
    EXCEPTION
      WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'seat_taken');
    END;
    v_ids := array_append(v_ids, v_hold.id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'expires_at', v_expires, 'id', v_ids[1]);
END;
$$;


CREATE OR REPLACE FUNCTION public.admission_hold_reap(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admission_holds%ROWTYPE;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.admission_holds
     WHERE status = 'held' AND expires_at <= now()
     ORDER BY expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
     FOR UPDATE SKIP LOCKED
  LOOP
    IF v_row.allocation_id IS NOT NULL THEN
      PERFORM public.release_capacity(ARRAY[v_row.allocation_id]);
    END IF;
    UPDATE public.admission_holds SET status = 'released', version = version + 1 WHERE id = v_row.id;
    v_n := v_n + 1;
  END LOOP;

  -- A consumed seat whose purchase died (the order sweep cancelled it, or it
  -- was refunded) goes back on the map. Never on expiry alone: a converted
  -- hold's lifetime is its order's, not its own.
  FOR v_row IN
    SELECT h.* FROM public.admission_holds h
      JOIN public.orders o ON o.id = h.order_id
     WHERE h.status = 'converted' AND o.status IN ('cancelled', 'refunded')
     ORDER BY h.created_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
     FOR UPDATE OF h SKIP LOCKED
  LOOP
    IF v_row.allocation_id IS NOT NULL THEN
      PERFORM public.release_capacity(ARRAY[v_row.allocation_id]);
    END IF;
    UPDATE public.admission_holds SET status = 'released', version = version + 1 WHERE id = v_row.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'released', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.admission_hold_consume(
  p_tenant_id uuid,
  p_hold_ids uuid[],
  p_order_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_hold public.admission_holds%ROWTYPE;
  v_id uuid;
  v_until timestamptz;
  v_ttl integer;
  v_allocs uuid[] := ARRAY[]::uuid[];
  v_converted uuid[] := ARRAY[]::uuid[];
  v_already integer := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_hold_ids IS NULL OR cardinality(p_hold_ids) < 1
     OR cardinality(p_hold_ids) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_order.status NOT IN ('draft', 'pending_payment') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_open');
  END IF;

  -- Lock in id order so two consumers of overlapping sets cannot deadlock.
  FOR v_id IN SELECT DISTINCT h FROM unnest(p_hold_ids) AS h ORDER BY h LOOP
    SELECT * INTO v_hold FROM public.admission_holds WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found', 'hold_id', v_id); END IF;
    IF v_hold.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    IF v_hold.status = 'converted' THEN
      IF v_hold.order_id IS NOT DISTINCT FROM p_order_id THEN
        v_already := v_already + 1;
        CONTINUE;
      END IF;
      RETURN jsonb_build_object('ok', false, 'reason', 'seat_taken', 'hold_id', v_id);
    END IF;
    IF v_hold.status <> 'held' OR v_hold.expires_at <= now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'hold_expired', 'hold_id', v_id);
    END IF;

    v_until := GREATEST(v_hold.expires_at, COALESCE(v_order.hold_expires_at, v_hold.expires_at));
    UPDATE public.admission_holds
       SET status = 'converted',
           order_id = p_order_id,
           expires_at = v_until,
           version = version + 1
     WHERE id = v_hold.id;
    v_converted := array_append(v_converted, v_hold.id);
    IF v_hold.allocation_id IS NOT NULL AND v_until > v_hold.expires_at THEN
      v_allocs := array_append(v_allocs, v_hold.allocation_id);
    END IF;
  END LOOP;

  -- The seat's own allocation lives as long as the purchase does.
  IF cardinality(v_allocs) > 0 THEN
    v_ttl := GREATEST(30, LEAST(604800, CEIL(EXTRACT(EPOCH FROM (v_until - now())))::integer));
    PERFORM public.extend_capacity_hold(v_allocs, v_ttl);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'converted', to_jsonb(v_converted),
    'already', v_already > 0 AND cardinality(v_converted) = 0,
    'expires_at', v_until
  );
EXCEPTION
  WHEN SQLSTATE 'CP016' THEN
    -- extend_capacity_hold: a seat allocation was already released under us.
    RETURN jsonb_build_object('ok', false, 'reason', 'hold_expired');
END;
$$;

REVOKE ALL ON FUNCTION public.admission_hold_consume(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_hold_consume(uuid, uuid[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admission_hold_seats(uuid, uuid, uuid[], text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_hold_seats(uuid, uuid, uuid[], text, integer, text) TO service_role;
REVOKE ALL ON FUNCTION public.admission_hold_reap(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_hold_reap(integer) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.admission_hold_consume(uuid,uuid[],uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admission_hold_consume(uuid,uuid[],uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admission_hold_seats(uuid,uuid,uuid[],text,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admission_hold_reap(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'admission_hold_consume is executable by anon or authenticated';
  END IF;
END
$check$;

-- PROOF. A proof tenant, a venue, one seat, one night, one open order.
DO $proof$
DECLARE
  v_tenant uuid;
  v_venue uuid;
  v_seat uuid;
  v_session uuid;
  v_order uuid;
  v_other uuid;
  v_paid uuid;
  v_hold jsonb;
  v_hold_id uuid;
  v_reply jsonb;
  v_status text;
  v_order_on uuid;
  v_expires timestamptz;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('a5-proof-' || substr(gen_random_uuid()::text, 1, 12), 'A5 hold consume proof')
  RETURNING id INTO v_tenant;
  INSERT INTO public.venues (tenant_id, name) VALUES (v_tenant, 'A5 proof venue') RETURNING id INTO v_venue;
  INSERT INTO public.spaces (tenant_id, venue_id, kind, name, code, party_min, party_max)
  VALUES (v_tenant, v_venue, 'seat', 'A5 seat', 'A5-1', 1, 1) RETURNING id INTO v_seat;
  INSERT INTO public.sessions (tenant_id, venue_id, starts_at, ends_at, status)
  VALUES (v_tenant, v_venue, now() + interval '2 days', now() + interval '2 days 2 hours', 'scheduled')
  RETURNING id INTO v_session;
  -- Guest orders past draft need a receipt code (orders_identified_before_payment).
  INSERT INTO public.orders (tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents, total_cents, source_channel, guest_session_id, receipt_code, hold_expires_at)
  VALUES (v_tenant, 'pending_payment', 'USD', 1000, 0, 0, 1000, 'web', 'a5-proof-guest', 'a5p' || replace(gen_random_uuid()::text, '-', ''), now() + interval '30 minutes')
  RETURNING id INTO v_order;
  INSERT INTO public.orders (tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents, total_cents, source_channel, guest_session_id, receipt_code)
  VALUES (v_tenant, 'pending_payment', 'USD', 1000, 0, 0, 1000, 'web', 'a5-proof-guest-2', 'a5q' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_other;
  INSERT INTO public.orders (tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents, total_cents, source_channel, guest_session_id, receipt_code)
  VALUES (v_tenant, 'paid', 'USD', 1000, 0, 0, 1000, 'web', 'a5-proof-guest-3', 'a5r' || replace(gen_random_uuid()::text, '-', ''))
  RETURNING id INTO v_paid;

  -- The guest holds the seat (180 s), as the picker does.
  v_hold := public.admission_hold_seats(v_tenant, v_session, ARRAY[v_seat], 'a5-guest', 180, 'a5-proof-hold-key');
  IF COALESCE((v_hold->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A5 proof: hold failed: %', v_hold;
  END IF;
  v_hold_id := (v_hold->>'id')::uuid;

  -- CLAIM 1: a paid (closed) order cannot consume.
  v_reply := public.admission_hold_consume(v_tenant, ARRAY[v_hold_id], v_paid);
  IF v_reply->>'reason' IS DISTINCT FROM 'not_open' THEN
    RAISE EXCEPTION 'A5 proof: a closed order consumed a hold: %', v_reply;
  END IF;

  -- CLAIM 2: the open purchase consumes; the hold is converted, bound, and
  -- lives as long as the order's own window (30 min > 180 s).
  v_reply := public.admission_hold_consume(v_tenant, ARRAY[v_hold_id], v_order);
  IF COALESCE((v_reply->>'ok')::boolean, false) IS NOT TRUE OR jsonb_array_length(v_reply->'converted') <> 1 THEN
    RAISE EXCEPTION 'A5 proof: consume refused: %', v_reply;
  END IF;
  SELECT status, order_id, expires_at INTO v_status, v_order_on, v_expires FROM public.admission_holds WHERE id = v_hold_id;
  IF v_status <> 'converted' OR v_order_on IS DISTINCT FROM v_order THEN
    RAISE EXCEPTION 'A5 proof: hold not bound to the order (%, %)', v_status, v_order_on;
  END IF;
  IF v_expires < now() + interval '25 minutes' THEN
    RAISE EXCEPTION 'A5 proof: hold expiry was not pushed to the order window: %', v_expires;
  END IF;

  -- CLAIM 3: consuming again for the same order is already; for another order it is seat_taken.
  v_reply := public.admission_hold_consume(v_tenant, ARRAY[v_hold_id], v_order);
  IF COALESCE((v_reply->>'already')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A5 proof: second consume was not idempotent: %', v_reply;
  END IF;
  v_reply := public.admission_hold_consume(v_tenant, ARRAY[v_hold_id], v_other);
  IF v_reply->>'reason' IS DISTINCT FROM 'seat_taken' THEN
    RAISE EXCEPTION 'A5 proof: another order took a consumed seat: %', v_reply;
  END IF;

  -- CLAIM 4: the reaper leaves a converted seat alone even past the original 180 s.
  UPDATE public.admission_holds SET expires_at = now() - interval '1 second' WHERE id = v_hold_id;
  PERFORM public.admission_hold_reap(50);
  SELECT status INTO v_status FROM public.admission_holds WHERE id = v_hold_id;
  IF v_status <> 'converted' THEN
    RAISE EXCEPTION 'A5 proof: the reaper released a consumed seat';
  END IF;

  -- CLAIM 5: the converted seat is taken for the next guest while its order lives,
  -- and freed once the order is cancelled (inline here, and by the reaper).
  v_hold := public.admission_hold_seats(v_tenant, v_session, ARRAY[v_seat], 'a5-guest-b', 30, 'a5-proof-hold-key-b');
  IF v_hold->>'reason' IS DISTINCT FROM 'seat_taken' THEN
    RAISE EXCEPTION 'A5 proof: a consumed seat was holdable again: %', v_hold;
  END IF;
  UPDATE public.orders SET status = 'cancelled' WHERE id = v_order;
  PERFORM public.admission_hold_reap(50);
  SELECT status INTO v_status FROM public.admission_holds WHERE id = v_hold_id;
  IF v_status <> 'released' THEN
    RAISE EXCEPTION 'A5 proof: the reaper left a consumed seat on a cancelled order (%)', v_status;
  END IF;
  UPDATE public.orders SET status = 'pending_payment' WHERE id = v_order;

  -- CLAIM 6: a lapsed hold cannot be consumed.
  v_hold := public.admission_hold_seats(v_tenant, v_session, ARRAY[v_seat], 'a5-guest-b', 30, 'a5-proof-hold-key-c');
  IF COALESCE((v_hold->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'A5 proof: the freed seat could not be held: %', v_hold;
  END IF;
  v_hold_id := (v_hold->>'id')::uuid;
  UPDATE public.admission_holds SET expires_at = now() - interval '1 second' WHERE id = v_hold_id;
  v_reply := public.admission_hold_consume(v_tenant, ARRAY[v_hold_id], v_order);
  IF v_reply->>'reason' IS DISTINCT FROM 'hold_expired' THEN
    RAISE EXCEPTION 'A5 proof: an expired hold was consumed: %', v_reply;
  END IF;

  -- Clean up. Children first; the agency cascade is not relied on.
  DELETE FROM public.admission_holds WHERE tenant_id = v_tenant;
  DELETE FROM public.capacity_allocations WHERE tenant_id = v_tenant;
  DELETE FROM public.orders WHERE tenant_id = v_tenant;
  DELETE FROM public.sessions WHERE tenant_id = v_tenant;
  DELETE FROM public.spaces WHERE tenant_id = v_tenant;
  DELETE FROM public.venues WHERE tenant_id = v_tenant;
  DELETE FROM public.agencies WHERE id = v_tenant;

  RAISE NOTICE 'A5 proof: a closed order cannot consume, an open one binds and extends the seat, replay is idempotent, another order is refused, the reaper leaves it while the order lives and frees it once cancelled, a lapsed hold is refused.';
END
$proof$;

COMMIT;
