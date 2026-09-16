-- D-136: session_move_participant reserved the target seat as a 15-minute
-- hold (reserve_resource_set_v2 ... 900) and never committed it. The seat-map
-- hold path commits on checkout; a move has no checkout, so the hold reaper
-- freed the seat while the admission stayed valid on the new session.
-- Same function, plus commit_capacity on the new allocation in the same
-- transaction, before the old seat is released.

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
  v_line uuid;
  v_commit jsonb;
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

  -- D-136: the new seat was left as a 15-minute HOLD. Nothing checks out a
  -- move, so the reaper freed the seat, the session resold it, and the moved
  -- person held a valid ticket with no place. The seat is committed here, in
  -- the same transaction, carrying the order line the old seat carried.
  IF v_adm.allocation_id IS NOT NULL THEN
    SELECT ca.order_line_id INTO v_line
      FROM public.capacity_allocations ca
     WHERE ca.id = v_adm.allocation_id;
  END IF;
  v_commit := public.commit_capacity(ARRAY[v_alloc], v_line);
  IF (v_commit->>'ok')::boolean IS NOT TRUE THEN
    PERFORM public.release_capacity(ARRAY[v_alloc]);
    RETURN jsonb_build_object('ok', false, 'reason', 'sold_out');
  END IF;

  IF v_adm.allocation_id IS NOT NULL THEN
    PERFORM public.release_capacity(ARRAY[v_adm.allocation_id]);
  END IF;

  RETURN jsonb_build_object('ok', true, 'admission_id', v_adm.id, 'allocation_id', v_alloc);
END;
$$;
