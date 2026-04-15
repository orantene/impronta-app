-- Fix: rename PL/pgSQL variable booking_id → v_booking_id to eliminate
-- ambiguity with the booking_talent.booking_id column in the rollup subquery.

BEGIN;

CREATE OR REPLACE FUNCTION public.engine_convert_to_booking(
  p_inquiry_id UUID,
  p_actor_user_id UUID,
  p_inquiry_expected_version INT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq RECORD;
  off RECORD;
  v_booking_id UUID;
BEGIN
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.uses_new_engine IS NOT TRUE THEN RAISE EXCEPTION 'legacy_use_convert_flow'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Idempotency: already booked -> return existing booking id
  IF inq.booked_at IS NOT NULL THEN
    SELECT id INTO v_booking_id
    FROM public.agency_bookings
    WHERE source_inquiry_id = p_inquiry_id
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_booking_id IS NOT NULL THEN
      RETURN v_booking_id;
    END IF;
  END IF;

  IF inq.status <> 'approved' THEN RAISE EXCEPTION 'approvals_incomplete'; END IF;
  IF inq.current_offer_id IS NULL THEN RAISE EXCEPTION 'no_active_offer'; END IF;

  SELECT * INTO off FROM public.inquiry_offers WHERE id = inq.current_offer_id FOR UPDATE;
  IF NOT FOUND OR off.status <> 'accepted' THEN RAISE EXCEPTION 'no_active_offer'; END IF;

  INSERT INTO public.agency_bookings (
    source_inquiry_id, client_user_id, client_account_id, client_contact_id,
    owner_staff_id, created_by_staff_id, title, status,
    contact_name, contact_email, contact_phone,
    event_type_id, event_date, venue_location_text,
    total_client_revenue, currency_code, client_summary,
    source_type_snapshot, tenant_id_snapshot,
    coordinator_user_id_snapshot, owner_user_id_snapshot,
    event_timezone_snapshot,
    coordinator_response_time_ms, time_to_first_offer_ms, time_to_booking_ms
  ) VALUES (
    p_inquiry_id, inq.client_user_id, inq.client_account_id, inq.client_contact_id,
    p_actor_user_id, p_actor_user_id,
    COALESCE(inq.contact_name || ' — booking', 'Booking'), 'confirmed',
    inq.contact_name, inq.contact_email, inq.contact_phone,
    inq.event_type_id, inq.event_date, inq.event_location,
    off.total_client_price, off.currency_code, off.notes,
    inq.source_type, inq.tenant_id,
    inq.coordinator_id, inq.owner_user_id,
    inq.event_timezone,
    NULL, NULL, NULL
  ) RETURNING id INTO v_booking_id;

  -- Snapshot talent from offer line items
  INSERT INTO public.booking_talent (
    booking_id, talent_profile_id, talent_name_snapshot, profile_code_snapshot,
    role_label, pricing_unit, units,
    talent_cost_rate, client_charge_rate,
    talent_cost_total, client_charge_total, gross_profit, sort_order
  )
  SELECT
    v_booking_id, li.talent_profile_id, tp.display_name, tp.profile_code,
    li.label, li.pricing_unit, li.units,
    CASE WHEN li.units IS NULL OR li.units = 0 THEN 0 ELSE li.talent_cost / li.units END,
    li.unit_price, li.talent_cost, li.total_price, (li.total_price - li.talent_cost), li.sort_order
  FROM public.inquiry_offer_line_items li
  LEFT JOIN public.talent_profiles tp ON tp.id = li.talent_profile_id
  WHERE li.offer_id = off.id;

  -- Roll up totals into booking header (v_booking_id is unambiguous)
  UPDATE public.agency_bookings
    SET total_talent_cost   = (SELECT COALESCE(SUM(talent_cost_total), 0)   FROM public.booking_talent WHERE booking_id = v_booking_id),
        total_client_revenue = (SELECT COALESCE(SUM(client_charge_total), 0) FROM public.booking_talent WHERE booking_id = v_booking_id),
        gross_profit         = (SELECT COALESCE(SUM(gross_profit), 0)        FROM public.booking_talent WHERE booking_id = v_booking_id)
    WHERE id = v_booking_id;

  -- Mark inquiry booked
  UPDATE public.inquiries
    SET status = 'booked', booked_at = now(), next_action_by = NULL,
        version = version + 1, last_edited_by = p_actor_user_id, last_edited_at = now()
    WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;

  INSERT INTO public.inquiry_activity_log (inquiry_id, actor_user_id, event_type, payload)
  VALUES (p_inquiry_id, p_actor_user_id, 'inquiry_converted_to_booking', jsonb_build_object('booking_id', v_booking_id));

  INSERT INTO public.booking_activity_log (booking_id, actor_user_id, event_type, payload)
  VALUES (v_booking_id, p_actor_user_id, 'booking.converted_from_inquiry', jsonb_build_object('inquiry_id', p_inquiry_id));

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT) TO authenticated;

COMMIT;
