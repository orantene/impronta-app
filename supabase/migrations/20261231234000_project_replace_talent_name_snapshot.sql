-- D-119: project_replace_talent is the writer of booking_talent. After a
-- replace it left talent_name_snapshot as the outgoing person. Stamp the
-- incoming talent's display name (then first+last, then legal name).

BEGIN;

CREATE OR REPLACE FUNCTION public.project_replace_talent(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_from_talent uuid,
  p_to_talent uuid,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.agency_bookings%ROWTYPE;
  v_row public.booking_talent%ROWTYPE;
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_name text;
BEGIN
  IF p_tenant_id IS NULL OR p_booking_id IS NULL OR p_from_talent IS NULL
     OR p_to_talent IS NULL OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF p_from_talent = p_to_talent THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_booking
    FROM public.agency_bookings
   WHERE id = p_booking_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_booking.status IN ('in_progress', 'completed', 'cancelled', 'archived')
     OR (v_booking.starts_at IS NOT NULL AND v_booking.starts_at <= now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_started');
  END IF;

  SELECT * INTO v_row
    FROM public.booking_talent
   WHERE booking_id = p_booking_id AND tenant_id = p_tenant_id
     AND talent_profile_id = p_from_talent
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.talent_bookings tb
     WHERE tb.tenant_id = p_tenant_id
       AND tb.talent_profile_id = p_to_talent
       AND tb.status IN ('confirmed', 'completed')
       AND v_booking.starts_at IS NOT NULL
       AND tb.starts_at < COALESCE(v_booking.ends_at, v_booking.starts_at + interval '1 hour')
       AND COALESCE(tb.ends_at, tb.starts_at + interval '1 hour') > v_booking.starts_at
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'talent_unavailable');
  END IF;

  SELECT COALESCE(
           NULLIF(btrim(tp.display_name), ''),
           NULLIF(btrim(concat_ws(' ', tp.first_name, tp.last_name)), ''),
           NULLIF(btrim(tp.legal_name), '')
         )
    INTO v_name
    FROM public.talent_profiles tp
   WHERE tp.id = p_to_talent;

  UPDATE public.booking_talent
     SET talent_profile_id = p_to_talent,
         talent_name_snapshot = COALESCE(v_name, v_row.talent_name_snapshot)
   WHERE id = v_row.id AND tenant_id = p_tenant_id;

  IF v_booking.source_inquiry_id IS NOT NULL THEN
    UPDATE public.talent_bookings
       SET talent_profile_id = p_to_talent, updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND inquiry_id = v_booking.source_inquiry_id
       AND talent_profile_id = p_from_talent
       AND status <> 'cancelled';

    UPDATE public.talent_holds
       SET talent_profile_id = p_to_talent
     WHERE tenant_id = p_tenant_id
       AND inquiry_id = v_booking.source_inquiry_id
       AND talent_profile_id = p_from_talent
       AND hold_strength = 'firm';
  END IF;

  RETURN jsonb_build_object('ok', true, 'booking_id', v_booking.id);
END;
$$;

REVOKE ALL ON FUNCTION public.project_replace_talent(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_replace_talent(uuid, uuid, uuid, uuid, text) TO service_role;

COMMIT;
