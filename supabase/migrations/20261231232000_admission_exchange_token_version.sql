-- Exchange must kill the old door code: bump token_version with version.

BEGIN;

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
  v_from public.sessions%ROWTYPE;
  v_old_cents bigint := 0;
  v_new_cents bigint := 0;
  v_line uuid;
  v_delta bigint;
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
  IF v_adm.session_id IS NOT NULL THEN
    SELECT * INTO v_from FROM public.sessions WHERE id = v_adm.session_id;
  END IF;

  IF v_adm.order_line_id IS NOT NULL THEN
    SELECT total_cents INTO v_old_cents FROM public.order_lines WHERE id = v_adm.order_line_id;
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

  UPDATE public.admissions
     SET session_id = p_to_session_id,
         starts_at = v_to.starts_at,
         version = version + 1,
         token_version = token_version + 1,
         updated_at = now()
   WHERE id = v_adm.id;

  IF v_delta > 0 AND v_adm.order_line_id IS NOT NULL THEN
    INSERT INTO public.order_lines (
      tenant_id, order_id, offering_id, session_id, label, units, unit_cents, total_cents
    )
    SELECT ol.tenant_id, ol.order_id, ol.offering_id, p_to_session_id,
           'Exchange balance', 1, v_delta, v_delta
      FROM public.order_lines ol WHERE ol.id = v_adm.order_line_id
    RETURNING id INTO v_line;
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'price_up_needs_payment',
      'amount_cents', v_delta, 'line_id', v_line, 'id', v_adm.id
    );
  END IF;

  IF v_delta < 0 AND v_adm.order_line_id IS NOT NULL THEN
    INSERT INTO public.ticket_refund_intents (tenant_id, order_id, order_line_id, reason)
    SELECT ol.tenant_id, ol.order_id, ol.id, 'admission_exchange'
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

DO $proof$
BEGIN
  IF position('token_version = token_version + 1' in pg_get_functiondef('public.admission_exchange(uuid,uuid,uuid,text,integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'P3 exchange proof: token_version is not bumped';
  END IF;
END
$proof$;

COMMIT;
