-- Package 1 task 6: visit transfer / split / merge / change server.
-- L52 amendment: a visit may own more than one order (split check).

BEGIN;

DROP INDEX IF EXISTS public.orders_one_per_visit;

CREATE INDEX IF NOT EXISTS orders_visit_id_open_idx
  ON public.orders (visit_id)
  WHERE visit_id IS NOT NULL;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS server_user_id uuid;

CREATE OR REPLACE FUNCTION public.visit_transfer(
  p_tenant_id uuid,
  p_visit_id uuid,
  p_to_space uuid,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit public.visits%ROWTYPE;
  v_occ uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_visit_id IS NULL OR p_to_space IS NULL
     OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT * INTO v_visit FROM public.visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_visit.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v_visit.status IS DISTINCT FROM 'open' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_open'); END IF;
  IF v_visit.space_id = p_to_space THEN
    RETURN jsonb_build_object('ok', true, 'visit_id', p_visit_id, 'space_id', p_to_space, 'already', true);
  END IF;

  SELECT id INTO v_occ FROM public.visits
   WHERE tenant_id = p_tenant_id AND status = 'open' AND (space_id = p_to_space OR joined_space_id = p_to_space)
     AND id IS DISTINCT FROM p_visit_id
   FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'space_occupied'); END IF;

  UPDATE public.visits
     SET space_id = p_to_space, version = v_visit.version + 1, updated_at = now()
   WHERE id = p_visit_id AND version = v_visit.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  UPDATE public.orders SET space_id = p_to_space WHERE visit_id = p_visit_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('ok', true, 'visit_id', p_visit_id, 'space_id', p_to_space);
END;
$$;

CREATE OR REPLACE FUNCTION public.visit_split_check(
  p_tenant_id uuid,
  p_visit_id uuid,
  p_line_ids uuid[],
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit public.visits%ROWTYPE;
  v_from uuid;
  v_new uuid;
  v_paid integer;
BEGIN
  IF p_tenant_id IS NULL OR p_visit_id IS NULL OR p_line_ids IS NULL OR coalesce(array_length(p_line_ids, 1), 0) = 0
     OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT * INTO v_visit FROM public.visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_visit.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v_visit.status IS DISTINCT FROM 'open' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_open'); END IF;

  SELECT o.id INTO v_from FROM public.orders o
   WHERE o.visit_id = p_visit_id AND o.tenant_id = p_tenant_id AND o.status = 'draft'
   ORDER BY o.created_at FOR UPDATE LIMIT 1;
  IF v_from IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  SELECT count(*) INTO v_paid
    FROM public.booking_transactions
   WHERE order_id = v_from AND status IN ('paid', 'payment_requested');
  IF v_paid > 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'lines_paid'); END IF;

  INSERT INTO public.orders (
    tenant_id, status, currency, version, subtotal_cents, discount_cents, tax_cents, total_cents,
    source_channel, source_page, visit_id, space_id, payout_release_rule, guest_session_id, receipt_code
  )
  SELECT tenant_id, 'draft', currency, 1, 0, 0, 0, 0,
         source_channel, source_page, visit_id, space_id, payout_release_rule,
         'pos:' || gen_random_uuid()::text,
         replace(gen_random_uuid()::text, '-', '')
    FROM public.orders WHERE id = v_from
  RETURNING id INTO v_new;

  UPDATE public.order_lines SET order_id = v_new
   WHERE order_id = v_from AND id = ANY (p_line_ids) AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    DELETE FROM public.orders WHERE id = v_new;
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  UPDATE public.orders o SET
    subtotal_cents = COALESCE((SELECT SUM(total_cents) FROM public.order_lines WHERE order_id = o.id), 0),
    total_cents = COALESCE((SELECT SUM(total_cents) FROM public.order_lines WHERE order_id = o.id), 0) - o.discount_cents + o.tax_cents + COALESCE(o.tip_cents, 0),
    version = o.version + 1
  WHERE o.id IN (v_from, v_new);

  RETURN jsonb_build_object('ok', true, 'order_id', v_new, 'from_order_id', v_from);
END;
$$;

CREATE OR REPLACE FUNCTION public.visit_merge_checks(
  p_tenant_id uuid,
  p_from_visit uuid,
  p_into_visit uuid,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from public.visits%ROWTYPE;
  v_into public.visits%ROWTYPE;
  v_from_order uuid;
  v_into_order uuid;
  v_live integer;
BEGIN
  IF p_tenant_id IS NULL OR p_from_visit IS NULL OR p_into_visit IS NULL OR p_from_visit = p_into_visit
     OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT * INTO v_from FROM public.visits WHERE id = p_from_visit FOR UPDATE;
  SELECT * INTO v_into FROM public.visits WHERE id = p_into_visit FOR UPDATE;
  IF v_from.id IS NULL OR v_into.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_from.tenant_id IS DISTINCT FROM p_tenant_id OR v_into.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_from.status IS DISTINCT FROM 'open' OR v_into.status IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_open');
  END IF;

  SELECT id INTO v_from_order FROM public.orders WHERE visit_id = p_from_visit AND status = 'draft' FOR UPDATE LIMIT 1;
  SELECT id INTO v_into_order FROM public.orders WHERE visit_id = p_into_visit AND status = 'draft' FOR UPDATE LIMIT 1;
  IF v_from_order IS NULL OR v_into_order IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  SELECT count(*) INTO v_live FROM public.order_collection_reservations
   WHERE order_id IN (v_from_order, v_into_order) AND state = 'reserved' AND expires_at > now();
  IF v_live > 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_transactions
     WHERE order_id IN (v_from_order, v_into_order) AND status IN ('paid', 'payment_requested')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lines_paid');
  END IF;

  UPDATE public.order_lines SET order_id = v_into_order WHERE order_id = v_from_order;
  UPDATE public.orders o SET
    subtotal_cents = COALESCE((SELECT SUM(total_cents) FROM public.order_lines WHERE order_id = o.id), 0),
    total_cents = COALESCE((SELECT SUM(total_cents) FROM public.order_lines WHERE order_id = o.id), 0) - o.discount_cents + o.tax_cents + COALESCE(o.tip_cents, 0),
    version = o.version + 1
  WHERE o.id = v_into_order;
  UPDATE public.orders SET status = 'cancelled', version = version + 1 WHERE id = v_from_order;
  RETURN jsonb_build_object('ok', true, 'order_id', v_into_order);
END;
$$;

CREATE OR REPLACE FUNCTION public.visit_change_server(
  p_tenant_id uuid,
  p_visit_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit public.visits%ROWTYPE;
BEGIN
  SELECT * INTO v_visit FROM public.visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_visit.tenant_id IS DISTINCT FROM p_tenant_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant'); END IF;
  IF v_visit.status IS DISTINCT FROM 'open' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_open'); END IF;
  UPDATE public.visits SET server_user_id = p_user_id, version = v_visit.version + 1, updated_at = now()
   WHERE id = p_visit_id AND version = v_visit.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'visit_id', p_visit_id, 'server_user_id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.visit_transfer(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.visit_split_check(uuid, uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.visit_merge_checks(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.visit_change_server(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visit_transfer(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.visit_split_check(uuid, uuid, uuid[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.visit_merge_checks(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.visit_change_server(uuid, uuid, uuid) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.visit_transfer(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'visit_transfer is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_space uuid;
  v_visit uuid;
  v_reply jsonb;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p1-visit-' || substr(gen_random_uuid()::text, 1, 12), 'P1 visit proof')
  RETURNING id INTO v_tenant;

  v_reply := public.visit_transfer(v_tenant, gen_random_uuid(), gen_random_uuid(), 'visit-xfer-aaaa');
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P1 visit proof: expected not_found, got %', v_reply;
  END IF;

  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
