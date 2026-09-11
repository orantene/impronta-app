-- Package 2 task 2: substitute, move a seat, cancel with scope.
-- Refunds are intents (D-POS-72), never money inside this transaction.

BEGIN;

ALTER TABLE public.ticket_refund_intents
  DROP CONSTRAINT IF EXISTS ticket_refund_intents_reason_check;

ALTER TABLE public.ticket_refund_intents
  ADD CONSTRAINT ticket_refund_intents_reason_check
  CHECK (reason IN ('seat_lost_after_payment', 'event_cancelled', 'session_cancelled'));

CREATE OR REPLACE FUNCTION public.session_set_instructor(
  p_tenant_id uuid,
  p_session_id uuid,
  p_user_id uuid,
  p_scope text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions%ROWTYPE;
  v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL OR p_user_id IS NULL
     OR p_scope IS NULL OR p_scope NOT IN ('this', 'future', 'series') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_session
    FROM public.sessions
   WHERE id = p_session_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_session.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_cancelled');
  END IF;

  IF p_scope = 'this' THEN
    UPDATE public.sessions
       SET instructor_user_id = p_user_id, updated_at = now()
     WHERE id = v_session.id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF p_scope = 'future' THEN
    UPDATE public.sessions
       SET instructor_user_id = p_user_id, updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND status = 'scheduled'
       AND starts_at >= v_session.starts_at
       AND (
         (v_session.series_id IS NOT NULL AND series_id = v_session.series_id)
         OR (v_session.series_id IS NULL AND id = v_session.id)
       );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_session.series_id IS NOT NULL THEN
      UPDATE public.session_series
         SET instructor_user_id = p_user_id, updated_at = now()
       WHERE id = v_session.series_id AND tenant_id = p_tenant_id;
    END IF;
  ELSE
    IF v_session.series_id IS NULL THEN
      UPDATE public.sessions
         SET instructor_user_id = p_user_id, updated_at = now()
       WHERE id = v_session.id AND tenant_id = p_tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSE
      UPDATE public.session_series
         SET instructor_user_id = p_user_id, updated_at = now()
       WHERE id = v_session.series_id AND tenant_id = p_tenant_id;
      UPDATE public.sessions
         SET instructor_user_id = p_user_id, updated_at = now()
       WHERE tenant_id = p_tenant_id
         AND series_id = v_session.series_id
         AND status = 'scheduled';
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.session_move_participant(
  p_tenant_id uuid,
  p_admission_id uuid,
  p_to_session_id uuid,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adm public.admissions%ROWTYPE;
  v_from public.sessions%ROWTYPE;
  v_to public.sessions%ROWTYPE;
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_pool uuid;
  v_reserve jsonb;
  v_alloc uuid;
  v_party int;
BEGIN
  IF p_tenant_id IS NULL OR p_admission_id IS NULL OR p_to_session_id IS NULL
     OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_adm FROM public.admissions WHERE id = p_admission_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_adm.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_adm.status IS DISTINCT FROM 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_cancelled');
  END IF;
  IF v_adm.session_id IS NOT DISTINCT FROM p_to_session_id THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'admission_id', v_adm.id, 'allocation_id', v_adm.allocation_id);
  END IF;

  IF v_adm.session_id IS NOT NULL THEN
    SELECT * INTO v_from FROM public.sessions WHERE id = v_adm.session_id AND tenant_id = p_tenant_id FOR UPDATE;
  END IF;

  SELECT * INTO v_to
    FROM public.sessions
   WHERE id = p_to_session_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_to.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_cancelled');
  END IF;

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
  IF v_alloc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sold_out');
  END IF;

  UPDATE public.admissions
     SET session_id = v_to.id,
         allocation_id = v_alloc,
         starts_at = v_to.starts_at,
         updated_at = now()
   WHERE id = v_adm.id AND tenant_id = p_tenant_id AND status = 'valid';
  IF NOT FOUND THEN
    PERFORM public.release_capacity(ARRAY[v_alloc]);
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  IF v_adm.allocation_id IS NOT NULL THEN
    PERFORM public.release_capacity(ARRAY[v_adm.allocation_id]);
  END IF;

  RETURN jsonb_build_object('ok', true, 'admission_id', v_adm.id, 'allocation_id', v_alloc);
END;
$$;

CREATE OR REPLACE FUNCTION public.session_cancel(
  p_tenant_id uuid,
  p_session_id uuid,
  p_scope text,
  p_reason text,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions%ROWTYPE;
  v_ids uuid[];
  v_cancelled int := 0;
  v_pools int := 0;
  v_voided int := 0;
  v_intents int := 0;
  v_key text := btrim(COALESCE(p_operation_key, ''));
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL
     OR p_scope IS NULL OR p_scope NOT IN ('this', 'future', 'series')
     OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_session
    FROM public.sessions
   WHERE id = p_session_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF p_scope = 'this' THEN
    v_ids := ARRAY[v_session.id];
  ELSIF p_scope = 'future' THEN
    SELECT COALESCE(array_agg(id), ARRAY[v_session.id]) INTO v_ids
      FROM public.sessions
     WHERE tenant_id = p_tenant_id
       AND status = 'scheduled'
       AND starts_at >= v_session.starts_at
       AND (
         (v_session.series_id IS NOT NULL AND series_id = v_session.series_id)
         OR id = v_session.id
       );
  ELSE
    IF v_session.series_id IS NULL THEN
      v_ids := ARRAY[v_session.id];
    ELSE
      SELECT COALESCE(array_agg(id), ARRAY[v_session.id]) INTO v_ids
        FROM public.sessions
       WHERE tenant_id = p_tenant_id
         AND series_id = v_session.series_id
         AND status = 'scheduled';
    END IF;
  END IF;

  UPDATE public.sessions
     SET status = 'cancelled', updated_at = now()
   WHERE id = ANY (v_ids) AND tenant_id = p_tenant_id AND status = 'scheduled';
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  IF v_cancelled = 0 AND v_session.status = 'cancelled' AND p_scope = 'this' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_cancelled');
  END IF;

  UPDATE public.capacity_pools
     SET is_active = false, updated_at = now()
   WHERE tenant_id = p_tenant_id
     AND subject_kind = 'session_tier'
     AND subject_id = ANY (v_ids)
     AND is_active;
  GET DIAGNOSTICS v_pools = ROW_COUNT;

  UPDATE public.admissions
     SET status = 'void', updated_at = now()
   WHERE tenant_id = p_tenant_id
     AND session_id = ANY (v_ids)
     AND status = 'valid';
  GET DIAGNOSTICS v_voided = ROW_COUNT;

  INSERT INTO public.ticket_refund_intents (tenant_id, order_id, order_line_id, reason)
  SELECT ol.tenant_id, ol.order_id, ol.id, 'session_cancelled'
    FROM public.order_lines ol
    JOIN public.orders o ON o.id = ol.order_id
   WHERE ol.tenant_id = p_tenant_id
     AND ol.session_id = ANY (v_ids)
     AND o.status IN ('paid', 'fulfilled')
     AND ol.total_cents > ol.refunded_cents
  ON CONFLICT (order_line_id) DO NOTHING;
  GET DIAGNOSTICS v_intents = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions_cancelled', v_cancelled,
    'pools_deactivated', v_pools,
    'admissions_voided', v_voided,
    'refund_intents', v_intents,
    'paid_seats_need_refund', v_intents > 0,
    'reason_text', left(btrim(COALESCE(p_reason, '')), 200)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.session_set_instructor(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.session_move_participant(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.session_cancel(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_set_instructor(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_move_participant(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.session_cancel(uuid, uuid, text, text, text) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.session_move_participant(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'session_move_participant is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.session_move_participant(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'move-aaaa');
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P2 move proof: expected not_found, got %', v_reply;
  END IF;
  v_reply := public.session_cancel(gen_random_uuid(), gen_random_uuid(), 'this', 'x', 'cancel-aa');
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P2 cancel proof: expected not_found, got %', v_reply;
  END IF;
END
$proof$;

COMMIT;
