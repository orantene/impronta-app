-- D-121: isolated pos_reserve_collection already accepts method `link`
-- (pg_get_functiondef on fxlankepwnvelxjrahwk). On-disk 20261230002310 still
-- lists cash / online_card / terminal only. 20261231205000 string-replaced
-- the live body; a from-zero replay still starts from the three-method file.
-- Replace the body. Do not edit 20261230002310.

BEGIN;

ALTER TABLE public.order_collection_reservations
  DROP CONSTRAINT IF EXISTS order_collection_reservations_method_known;
ALTER TABLE public.order_collection_reservations
  ADD CONSTRAINT order_collection_reservations_method_known
  CHECK (method IN ('cash', 'online_card', 'terminal', 'link'));

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
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_reserve_collection(uuid, uuid, text, bigint, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_reserve_collection(uuid, uuid, text, bigint, text, uuid, integer, integer) TO service_role;

COMMIT;
