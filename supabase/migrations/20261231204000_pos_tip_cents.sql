-- Package 1 task 4: gratuity on the order, outside subtotal/tax, inside total.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tip_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_tip_nonneg;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_tip_nonneg CHECK (tip_cents >= 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_total_is_derived;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_total_is_derived CHECK (
    total_cents = subtotal_cents - discount_cents + tax_cents + tip_cents
  );

CREATE OR REPLACE FUNCTION public.pos_apply_draft_totals(
  p_tenant_id         uuid,
  p_order_id          uuid,
  p_expected_version  integer,
  p_discount_cents    bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_tax bigint := 0;
  v_tip bigint := 0;
  v_total bigint := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_order.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_draft');
  END IF;
  IF v_order.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  SELECT COALESCE(SUM(total_cents), 0), COALESCE(SUM(COALESCE(tax_cents, 0)), 0)
    INTO v_subtotal, v_tax
    FROM public.order_lines
   WHERE order_id = p_order_id;

  v_discount := GREATEST(0, LEAST(COALESCE(p_discount_cents, 0), v_subtotal));
  v_tip := GREATEST(0, COALESCE(v_order.tip_cents, 0));
  v_total := v_subtotal - v_discount + v_tax + v_tip;

  UPDATE public.orders
     SET subtotal_cents = v_subtotal,
         discount_cents = v_discount,
         tax_cents = v_tax,
         total_cents = v_total,
         version = v_order.version + 1
   WHERE id = p_order_id
     AND tenant_id = p_tenant_id
     AND status = 'draft'
     AND version = p_expected_version;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'version', v_order.version + 1,
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'tax_cents', v_tax,
    'tip_cents', v_tip,
    'total_cents', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_apply_draft_totals(uuid, uuid, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_apply_draft_totals(uuid, uuid, integer, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.pos_set_tip(
  p_tenant_id uuid,
  p_order_id uuid,
  p_tip_cents bigint,
  p_operation_key text,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_total bigint;
  v_live integer;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL
     OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF p_tip_cents IS NULL OR p_tip_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'negative');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_order.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_draft');
  END IF;
  IF v_order.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  SELECT count(*) INTO v_live
    FROM public.order_collection_reservations
   WHERE order_id = p_order_id AND state = 'reserved' AND expires_at > now();
  IF v_live > 0 OR EXISTS (
    SELECT 1 FROM public.booking_transactions
     WHERE order_id = p_order_id AND status IN ('paid', 'payment_requested')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_collected');
  END IF;

  v_total := v_order.subtotal_cents - v_order.discount_cents + v_order.tax_cents + p_tip_cents;

  UPDATE public.orders
     SET tip_cents = p_tip_cents,
         total_cents = v_total,
         version = v_order.version + 1
   WHERE id = p_order_id AND version = p_expected_version;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'tip_cents', p_tip_cents,
    'total_cents', v_total,
    'version', v_order.version + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_set_tip(uuid, uuid, bigint, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_set_tip(uuid, uuid, bigint, text, integer) TO service_role;

-- Keep mutate totals on the same identity.
CREATE OR REPLACE FUNCTION public.pos_mutate_draft_line(
  p_tenant_id         uuid,
  p_order_id          uuid,
  p_expected_version  integer,
  p_op                text,
  p_line              jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_line_id uuid;
  v_units numeric;
  v_unit_cents bigint;
  v_total_cents bigint;
  v_addons uuid[] := '{}';
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_tax bigint := 0;
  v_tip bigint := 0;
  v_total bigint := 0;
  v_kind text;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL
     OR p_op IS NULL OR p_op NOT IN ('add', 'update', 'remove') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v_order.status IS DISTINCT FROM 'draft' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_draft'); END IF;
  IF v_order.version IS DISTINCT FROM p_expected_version THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  IF p_op = 'add' THEN
    v_units := COALESCE(NULLIF(p_line->>'units', '')::numeric, 0);
    v_unit_cents := COALESCE(NULLIF(p_line->>'unit_cents', '')::bigint, 0);
    v_total_cents := COALESCE(NULLIF(p_line->>'total_cents', '')::bigint, round(v_unit_cents * v_units)::bigint);
    v_kind := COALESCE(NULLIF(trim(p_line->>'kind'), ''), 'catalog');
    IF v_kind NOT IN ('catalog', 'custom') OR v_units <= 0 OR v_unit_cents < 0 OR NULLIF(trim(p_line->>'label'), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF v_kind = 'custom' AND NULLIF(p_line->>'offering_id', '') IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF p_line ? 'addon_ids' AND jsonb_typeof(p_line->'addon_ids') = 'array' THEN
      SELECT COALESCE(array_agg(x::uuid), '{}') INTO v_addons
        FROM jsonb_array_elements_text(p_line->'addon_ids') AS x WHERE x <> '';
    END IF;
    INSERT INTO public.order_lines (
      order_id, tenant_id, offering_id, variant_id, addon_ids, session_id,
      label, units, unit_cents, total_cents, talent_profile_id, owner_tenant_id,
      talent_cost_cents, sort_order, kind, operator_user_id, booking_id, booking_kind
    ) VALUES (
      p_order_id, p_tenant_id,
      NULLIF(p_line->>'offering_id', '')::uuid,
      NULLIF(p_line->>'variant_id', '')::uuid,
      COALESCE(v_addons, '{}'),
      NULLIF(p_line->>'session_id', '')::uuid,
      trim(p_line->>'label'), v_units, v_unit_cents, v_total_cents,
      NULLIF(p_line->>'talent_profile_id', '')::uuid,
      COALESCE(NULLIF(p_line->>'owner_tenant_id', '')::uuid, CASE WHEN v_kind = 'custom' THEN p_tenant_id ELSE NULL END),
      COALESCE(NULLIF(p_line->>'talent_cost_cents', '')::bigint, 0),
      COALESCE(NULLIF(p_line->>'sort_order', '')::integer, 0),
      v_kind,
      NULLIF(p_line->>'operator_user_id', '')::uuid,
      NULLIF(p_line->>'booking_id', '')::uuid,
      NULLIF(p_line->>'booking_kind', '')
    ) RETURNING id INTO v_line_id;
  ELSIF p_op = 'update' THEN
    v_line_id := NULLIF(p_line->>'id', '')::uuid;
    v_units := COALESCE(NULLIF(p_line->>'units', '')::numeric, 0);
    v_unit_cents := COALESCE(NULLIF(p_line->>'unit_cents', '')::bigint, 0);
    v_total_cents := COALESCE(NULLIF(p_line->>'total_cents', '')::bigint, round(v_unit_cents * v_units)::bigint);
    IF v_line_id IS NULL OR v_units <= 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
    UPDATE public.order_lines SET units = v_units, total_cents = v_total_cents
     WHERE id = v_line_id AND order_id = p_order_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  ELSE
    v_line_id := NULLIF(p_line->>'id', '')::uuid;
    IF v_line_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
    DELETE FROM public.order_lines WHERE id = v_line_id AND order_id = p_order_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  END IF;

  SELECT COALESCE(SUM(total_cents), 0), COALESCE(SUM(COALESCE(tax_cents, 0)), 0)
    INTO v_subtotal, v_tax FROM public.order_lines WHERE order_id = p_order_id;
  v_discount := GREATEST(0, LEAST(COALESCE(v_order.discount_cents, 0), v_subtotal));
  v_tip := GREATEST(0, COALESCE(v_order.tip_cents, 0));
  v_total := v_subtotal - v_discount + v_tax + v_tip;

  UPDATE public.orders
     SET subtotal_cents = v_subtotal, discount_cents = v_discount, tax_cents = v_tax,
         total_cents = v_total, version = v_order.version + 1
   WHERE id = p_order_id AND tenant_id = p_tenant_id AND status = 'draft' AND version = p_expected_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  RETURN jsonb_build_object(
    'ok', true, 'version', v_order.version + 1, 'line_id', v_line_id,
    'subtotal_cents', v_subtotal, 'discount_cents', v_discount,
    'tax_cents', v_tax, 'tip_cents', v_tip, 'total_cents', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_set_tip(uuid,uuid,bigint,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos_set_tip is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_order uuid;
  v_reply jsonb;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p1-tip-' || substr(gen_random_uuid()::text, 1, 12), 'P1 tip proof')
  RETURNING id INTO v_tenant;
  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    tip_cents, total_cents, source_channel, guest_session_id, version
  ) VALUES (
    v_tenant, 'draft', 'USD', 1000, 0, 0, 0, 1000, 'pos', 'p1-tip-proof', 1
  ) RETURNING id INTO v_order;

  v_reply := public.pos_set_tip(v_tenant, v_order, -1, 'tip-operation-aa', 1);
  IF v_reply->>'reason' IS DISTINCT FROM 'negative' THEN
    RAISE EXCEPTION 'P1 tip proof: expected negative, got %', v_reply;
  END IF;
  IF (SELECT tip_cents FROM public.orders WHERE id = v_order) <> 0 THEN
    RAISE EXCEPTION 'P1 tip proof: a refused tip wrote cents';
  END IF;

  DELETE FROM public.orders WHERE id = v_order;
  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
