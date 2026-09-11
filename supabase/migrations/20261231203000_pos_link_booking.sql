-- Package 1 task 3: attach a sale's lines to an existing booking.

BEGIN;

ALTER TABLE public.order_lines
  DROP CONSTRAINT IF EXISTS order_lines_booking_kind_known;
ALTER TABLE public.order_lines
  ADD CONSTRAINT order_lines_booking_kind_known
  CHECK (booking_kind IS NULL OR booking_kind IN ('talent_booking', 'agency_booking', 'admission'));

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

  SELECT booking_id INTO v_linked
    FROM public.order_lines
   WHERE order_id = p_order_id AND booking_id IS NOT NULL
   LIMIT 1;
  IF v_linked IS NOT NULL AND v_linked IS DISTINCT FROM p_booking_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_linked');
  END IF;
  IF v_linked IS NOT NULL AND v_linked IS NOT DISTINCT FROM p_booking_id THEN
    RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'already', true);
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

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_link_booking(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_link_booking(uuid, uuid, text, uuid, text) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_link_booking(uuid,uuid,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_link_booking(uuid,uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos_link_booking is executable by anon/authenticated';
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
  VALUES ('p1-link-' || substr(gen_random_uuid()::text, 1, 12), 'P1 link proof')
  RETURNING id INTO v_tenant;
  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id
  ) VALUES (
    v_tenant, 'draft', 'USD', 0, 0, 0, 0, 'pos', 'p1-link-proof'
  ) RETURNING id INTO v_order;

  v_reply := public.pos_link_booking(v_tenant, v_order, 'agency_booking', gen_random_uuid(), 'link-booking-aa');
  IF v_reply->>'reason' IS DISTINCT FROM 'wrong_tenant' THEN
    RAISE EXCEPTION 'P1 link proof: expected wrong_tenant, got %', v_reply;
  END IF;

  DELETE FROM public.orders WHERE id = v_order;
  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
