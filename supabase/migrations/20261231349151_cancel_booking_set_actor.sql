-- TUL-151: persist WHO cancelled a booking (role + optional user id).
-- Package-2 cancel_booking_set previously accepted only p_by in
-- ('staff','customer') and returned it in the JSON reply without writing it.
-- Audit could not tell talent vs client vs staff vs system, nor which user.
-- PM applies before merge (`cd web && npm run db:push`). Do not apply from agents.

BEGIN;

ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'agency_bookings_cancelled_by_check'
       AND conrelid = 'public.agency_bookings'::regclass
  ) THEN
    ALTER TABLE public.agency_bookings
      ADD CONSTRAINT agency_bookings_cancelled_by_check
      CHECK (
        cancelled_by IS NULL
        OR cancelled_by IN ('talent', 'client', 'staff', 'system')
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.agency_bookings.cancelled_by IS
  'Role that cancelled: talent | client | staff | system. Set by cancel_booking_set.';
COMMENT ON COLUMN public.agency_bookings.cancelled_by_user_id IS
  'Optional auth user who cancelled. Null for guest/token/system cancels.';

DROP FUNCTION IF EXISTS public.cancel_booking_set(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.cancel_booking_set(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_operation_key text,
  p_reason text,
  p_by text,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.agency_bookings%ROWTYPE;
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_reason text := left(btrim(COALESCE(p_reason, '')), 200);
  v_by text;
  v_allocs uuid[] := '{}';
BEGIN
  -- Legacy alias: older callers sent 'customer'; store the canonical 'client'.
  v_by := CASE
    WHEN p_by = 'customer' THEN 'client'
    ELSE p_by
  END;

  IF p_tenant_id IS NULL OR p_booking_id IS NULL OR char_length(v_key) < 8
     OR v_by IS NULL OR v_by NOT IN ('talent', 'client', 'staff', 'system') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_booking
    FROM public.agency_bookings
   WHERE id = p_booking_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'booking_id', v_booking.id,
      'order_id', v_booking.order_id,
      'by', v_booking.cancelled_by,
      'actor_id', v_booking.cancelled_by_user_id
    );
  END IF;
  IF v_booking.status NOT IN ('draft', 'tentative', 'confirmed', 'in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  END IF;

  UPDATE public.agency_bookings
     SET status = 'cancelled',
         cancelled_reason = NULLIF(v_reason, ''),
         cancelled_by = v_by,
         cancelled_by_user_id = p_actor_id,
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
    'by', v_by,
    'actor_id', p_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking_set(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_set(uuid, uuid, text, text, text, uuid) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.cancel_booking_set(uuid,uuid,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cancel_booking_set is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.cancel_booking_set(gen_random_uuid(), gen_random_uuid(), 'cancel-booking-aa', 'x', 'staff', NULL);
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'TUL-151 cancel_booking actor proof: expected not_found, got %', v_reply;
  END IF;
  v_reply := public.cancel_booking_set(gen_random_uuid(), gen_random_uuid(), 'cancel-booking-aa', 'x', 'customer', NULL);
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'TUL-151 customer→client alias proof: expected not_found, got %', v_reply;
  END IF;
  v_reply := public.cancel_booking_set(gen_random_uuid(), gen_random_uuid(), 'cancel-booking-aa', 'x', 'guest', NULL);
  IF v_reply->>'reason' IS DISTINCT FROM 'invalid' THEN
    RAISE EXCEPTION 'TUL-151 bad role proof: expected invalid, got %', v_reply;
  END IF;
END
$proof$;

COMMIT;
