-- Package 2 task 3: cancel a booking under the same lock as reschedule.
-- Money is not moved here. TS opens the existing refund path after.

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_booking_set(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_operation_key text,
  p_reason text,
  p_by text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.agency_bookings%ROWTYPE;
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_reason text := left(btrim(COALESCE(p_reason, '')), 200);
  v_allocs uuid[] := '{}';
BEGIN
  IF p_tenant_id IS NULL OR p_booking_id IS NULL OR char_length(v_key) < 8
     OR p_by IS NULL OR p_by NOT IN ('staff', 'customer') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_booking
    FROM public.agency_bookings
   WHERE id = p_booking_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'booking_id', v_booking.id);
  END IF;
  IF v_booking.status NOT IN ('draft', 'tentative', 'confirmed', 'in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  END IF;

  UPDATE public.agency_bookings
     SET status = 'cancelled',
         cancelled_reason = NULLIF(v_reason, ''),
         updated_at = now()
   WHERE id = v_booking.id AND tenant_id = p_tenant_id
     AND status IN ('draft', 'tentative', 'confirmed', 'in_progress');
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  IF v_booking.source_inquiry_id IS NOT NULL THEN
    UPDATE public.talent_bookings
       SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND inquiry_id = v_booking.source_inquiry_id
       AND status <> 'cancelled';

    DELETE FROM public.talent_holds
     WHERE tenant_id = p_tenant_id
       AND inquiry_id = v_booking.source_inquiry_id
       AND hold_strength IN ('soft', 'firm');
  END IF;

  IF v_booking.order_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(a.id), '{}') INTO v_allocs
      FROM public.capacity_allocations a
      JOIN public.order_lines ol ON ol.id = a.order_line_id
     WHERE a.tenant_id = p_tenant_id
       AND ol.order_id = v_booking.order_id
       AND a.released_at IS NULL;
    IF array_length(v_allocs, 1) IS NOT NULL THEN
      PERFORM public.release_capacity(v_allocs);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'order_id', v_booking.order_id,
    'by', p_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking_set(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_set(uuid, uuid, text, text, text) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.cancel_booking_set(uuid,uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cancel_booking_set is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.cancel_booking_set(gen_random_uuid(), gen_random_uuid(), 'cancel-booking-aa', 'x', 'staff');
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P2 cancel_booking proof: expected not_found, got %', v_reply;
  END IF;
END
$proof$;

COMMIT;
