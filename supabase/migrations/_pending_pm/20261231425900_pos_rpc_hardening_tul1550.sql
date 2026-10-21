-- TUL-1550 (P1 security, release gate): POS link/reserve RPC hardening.
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies it after merge.
-- Replaces two functions with the SAME signatures and grants (service_role only) and adds one
-- server-only table. No existing row is touched.
--
--  * pos_link_booking: the operation key was validated but never stored, so a retry was not
--    replayed. Now stored per tenant in pos_link_operations; a replay returns the first result
--    (already: true); the same key on a different order/booking is key_reused. A closed or
--    voided order is refused (not_open) instead of having its lines relinked.
--  * pos_reserve_collection: WHEN OTHERS returned SQLERRM (table, constraint and column names) to
--    the caller. It now logs the detail with RAISE WARNING and returns only reason 'unavailable'.
--
-- Rollback: restore the bodies from 20261231203000 and 20261231235000 and DROP TABLE
-- public.pos_link_operations (only if empty).

BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_link_operations (
  tenant_id      uuid        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  operation_key  text        NOT NULL,
  order_id       uuid        NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  booking_id     uuid        NOT NULL,
  booking_kind   text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, operation_key)
);
ALTER TABLE public.pos_link_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_link_operations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_link_booking(
  p_tenant_id uuid,
  p_order_id uuid,
  p_booking_kind text,
  p_booking_id uuid,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_owed bigint := 0;
  v_paid bigint := 0;
  v_linked uuid;
  v_op public.pos_link_operations%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_booking_id IS NULL
     OR p_booking_kind NOT IN ('talent_booking', 'agency_booking', 'admission')
     OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  -- TUL-1550: the operation key is stored; a retry with the same key replays the first result.
  SELECT * INTO v_op FROM public.pos_link_operations
   WHERE tenant_id = p_tenant_id AND operation_key = btrim(p_operation_key);
  IF FOUND THEN
    IF v_op.order_id = p_order_id AND v_op.booking_id = p_booking_id AND v_op.booking_kind = p_booking_kind THEN
      RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'already', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'key_reused');
  END IF;

  SELECT booking_id INTO v_linked
    FROM public.order_lines
   WHERE order_id = p_order_id AND booking_id IS NOT NULL
   LIMIT 1;
  IF v_linked IS NOT NULL AND v_linked IS DISTINCT FROM p_booking_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_linked');
  END IF;
  IF v_linked IS NOT NULL AND v_linked IS NOT DISTINCT FROM p_booking_id THEN
    INSERT INTO public.pos_link_operations (tenant_id, operation_key, order_id, booking_id, booking_kind)
    VALUES (p_tenant_id, btrim(p_operation_key), p_order_id, p_booking_id, p_booking_kind)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'already', true);
  END IF;

  -- TUL-1550: a closed or voided order is never relinked.
  IF v_order.status NOT IN ('draft', 'pending_payment') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_open');
  END IF;

  IF p_booking_kind = 'agency_booking' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.agency_bookings b
       WHERE b.id = p_booking_id AND b.tenant_id = p_tenant_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    SELECT COALESCE(round(b.total_client_revenue * 100), 0) INTO v_owed
      FROM public.agency_bookings b WHERE b.id = p_booking_id;
  ELSIF p_booking_kind = 'talent_booking' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.talent_bookings b
       WHERE b.id = p_booking_id AND b.tenant_id = p_tenant_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    v_owed := 1;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.admissions a
       WHERE a.id = p_booking_id AND a.tenant_id = p_tenant_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    v_owed := 1;
  END IF;

  SELECT COALESCE(SUM(gross_amount_cents), 0) INTO v_paid
    FROM public.booking_transactions
   WHERE booking_id = p_booking_id AND status = 'paid';

  IF p_booking_kind = 'agency_booking' AND v_owed <= v_paid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nothing_owed');
  END IF;

  UPDATE public.order_lines
     SET booking_id = p_booking_id, booking_kind = p_booking_kind
   WHERE order_id = p_order_id AND tenant_id = p_tenant_id;

  INSERT INTO public.pos_link_operations (tenant_id, operation_key, order_id, booking_id, booking_kind)
  VALUES (p_tenant_id, btrim(p_operation_key), p_order_id, p_booking_id, p_booking_kind)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_link_booking(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_link_booking(uuid, uuid, text, uuid, text) TO service_role;

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
  IF p_method IS NULL OR p_method NOT IN ('cash', 'online_card', 'terminal', 'link') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  SELECT * INTO v_existing
    FROM public.order_collection_reservations
   WHERE order_id = p_order_id AND operation_key = v_key;
  IF FOUND THEN
    v_paid := public.order_collected_cents(p_order_id);
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
      'expires_at', v_existing.expires_at,
      'version', v_order.version
    );
  END IF;

  IF v_order.status NOT IN ('draft', 'pending_payment') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_open');
  END IF;

  IF p_expected_version IS NOT NULL AND v_order.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_order.version);
  END IF;

  v_paid := public.order_collected_cents(p_order_id);

  SELECT COALESCE(SUM(r.amount_cents), 0) INTO v_reserved
    FROM public.order_collection_reservations r
   WHERE r.order_id = p_order_id AND r.state = 'reserved' AND r.expires_at > now();

  v_uncollected := v_order.total_cents - v_paid;
  IF v_uncollected <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_collected', 'outstanding_cents', 0);
  END IF;

  v_outstanding := v_uncollected - v_reserved;

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
    SELECT * INTO v_existing
      FROM public.order_collection_reservations
     WHERE order_id = p_order_id AND operation_key = v_key;
    IF FOUND THEN
      v_paid := public.order_collected_cents(p_order_id);
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
        'expires_at', v_existing.expires_at,
        'version', v_version
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  WHEN OTHERS THEN
    -- TUL-1550: the detail goes to the database log; the caller gets a stable reason only.
    RAISE WARNING 'pos_reserve_collection failed: % (SQLSTATE %)', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
END;
$$;

REVOKE ALL ON FUNCTION public.pos_reserve_collection(uuid, uuid, text, bigint, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_reserve_collection(uuid, uuid, text, bigint, text, uuid, integer, integer) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_link_booking(uuid,uuid,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_link_booking(uuid,uuid,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pos_reserve_collection(uuid,uuid,text,bigint,text,uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_reserve_collection(uuid,uuid,text,bigint,text,uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POS RPCs are executable by anon/authenticated';
  END IF;
END
$check$;

COMMIT;
