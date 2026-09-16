-- D-142: admission_comp inserted a `paid` order with neither customer_id nor
-- receipt_code (guest_session_id alone), so orders_identified_before_payment
-- refused it (23514) and Comp never issued a ticket. The function is
-- redefined with an optional p_customer_id (the holder the door resolved)
-- and always mints the receipt code a guest sale needs. The old signature
-- is dropped first so PostgREST has one candidate to call.

DROP FUNCTION IF EXISTS public.admission_comp(uuid, uuid, uuid, text, text, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.admission_comp(
  p_tenant_id uuid,
  p_session_id uuid,
  p_tier_variant_id uuid,
  p_holder_name text,
  p_holder_email text,
  p_reason text,
  p_approver uuid,
  p_actor_role text,
  p_operation_key text,
  p_customer_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_session public.sessions%ROWTYPE;
  v_variant public.talent_offering_variants%ROWTYPE;
  v_limit bigint;
  v_price bigint := 0;
  v_approved boolean := false;
  v_order uuid;
  v_line uuid;
  v_adm uuid;
  v_receipt text;
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL OR p_tier_variant_id IS NULL
     OR char_length(btrim(COALESCE(p_holder_name, ''))) < 1 OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  SELECT * INTO v_variant FROM public.talent_offering_variants WHERE id = p_tier_variant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  v_price := COALESCE(v_variant.amount_cents, 0);

  SELECT limit_cents INTO v_limit
    FROM public.role_limits
   WHERE tenant_id = p_tenant_id
     AND role = COALESCE(NULLIF(btrim(COALESCE(p_actor_role, '')), ''), 'editor')
     AND action = 'discount';
  IF v_limit IS NOT NULL AND v_price > v_limit THEN
    SELECT true INTO v_approved
      FROM public.approval_requests
     WHERE tenant_id = p_tenant_id
       AND kind = 'discount'
       AND subject_id IN (p_session_id, p_tier_variant_id)
       AND decision = 'approved'
     LIMIT 1;
    IF v_approved IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'needs_approval');
    END IF;
  END IF;

  -- D-142: a paid order must be reachable (orders_identified_before_payment):
  -- a customer, or a guest session PLUS a receipt code. The comp wrote the
  -- operation key as guest session and nothing else, so every comp was a
  -- 23514 and no ticket was ever issued. The admission's customer is the
  -- order's when the door resolved one; otherwise the comp is a guest sale
  -- with its receipt code, the way a walk-in draft is.
  IF p_customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND c.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  v_receipt := 'cmp' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, customer_id, guest_session_id, receipt_code, session_id
  ) VALUES (
    p_tenant_id, 'paid', 'USD', 0, v_price, 0, 0, 'admission_comp',
    p_customer_id, CASE WHEN p_customer_id IS NULL THEN v_key ELSE NULL END, v_receipt, p_session_id
  ) RETURNING id INTO v_order;

  INSERT INTO public.order_lines (
    tenant_id, order_id, offering_id, variant_id, session_id, label, units, unit_cents, total_cents
  ) VALUES (
    p_tenant_id, v_order, v_variant.offering_id, v_variant.id, p_session_id,
    'Comp', 1, 0, 0
  ) RETURNING id INTO v_line;

  INSERT INTO public.admissions (
    tenant_id, order_line_id, session_id, holder_name, holder_email, starts_at,
    status, party_size, token_version
  ) VALUES (
    p_tenant_id, v_line, p_session_id, btrim(p_holder_name),
    NULLIF(btrim(COALESCE(p_holder_email, '')), ''), v_session.starts_at,
    'valid', GREATEST(1, COALESCE(v_variant.admits_per_unit, 1)), 1
  ) RETURNING id INTO v_adm;

  RETURN jsonb_build_object('ok', true, 'id', v_adm, 'order_id', v_order, 'line_id', v_line, 'receipt_code', v_receipt);
END;
$$;

REVOKE ALL ON FUNCTION public.admission_comp(uuid, uuid, uuid, text, text, text, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_comp(uuid, uuid, uuid, text, text, text, uuid, text, text, uuid) TO service_role;
