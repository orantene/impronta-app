-- details v3 §5: inquiry → booking details-continuity columns
--
-- Adds operational-logistics columns to agency_bookings so that call-sheet /
-- logistics data captured during an inquiry survives the conversion.  The
-- corresponding columns on the `inquiries` table do not exist yet; the RPC
-- carry-forward is wired now so they flow automatically once the inquiry-side
-- columns land (see TODO in engine_convert_to_booking below).
--
-- All new columns default NULL — fully additive, no existing rows affected.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New columns on agency_bookings
-- ---------------------------------------------------------------------------
ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS wardrobe_notes  TEXT,
  ADD COLUMN IF NOT EXISTS equipment_notes TEXT,
  ADD COLUMN IF NOT EXISTS transport_notes TEXT,
  ADD COLUMN IF NOT EXISTS lodging_notes   TEXT,
  ADD COLUMN IF NOT EXISTS meals_notes     TEXT,
  ADD COLUMN IF NOT EXISTS access_notes    TEXT,
  ADD COLUMN IF NOT EXISTS timezone        TEXT,
  ADD COLUMN IF NOT EXISTS deadline_at     TIMESTAMPTZ;

COMMENT ON COLUMN public.agency_bookings.wardrobe_notes  IS 'details v3 §5: wardrobe / dress code requirements copied from inquiry on conversion.';
COMMENT ON COLUMN public.agency_bookings.equipment_notes IS 'details v3 §5: equipment / tech rider copied from inquiry on conversion.';
COMMENT ON COLUMN public.agency_bookings.transport_notes IS 'details v3 §5: transport / transfer notes copied from inquiry on conversion.';
COMMENT ON COLUMN public.agency_bookings.lodging_notes   IS 'details v3 §5: lodging / accommodation notes copied from inquiry on conversion.';
COMMENT ON COLUMN public.agency_bookings.meals_notes     IS 'details v3 §5: meals / catering notes copied from inquiry on conversion.';
COMMENT ON COLUMN public.agency_bookings.access_notes    IS 'details v3 §5: venue access / entry instructions copied from inquiry on conversion.';
COMMENT ON COLUMN public.agency_bookings.timezone        IS 'details v3 §5: IANA timezone for all booking times (supplements event_timezone_snapshot).';
COMMENT ON COLUMN public.agency_bookings.deadline_at     IS 'details v3 §5: hard deadline (e.g. latest talent confirmation, latest payment) copied from inquiry on conversion.';

-- ---------------------------------------------------------------------------
-- 2. Recreate engine_convert_to_booking to carry the new fields forward.
--
-- TODO (inquiry-side): once the following columns are added to `inquiries`,
-- the carry-forward below will populate automatically (no RPC change needed):
--   wardrobe_notes, equipment_notes, transport_notes, lodging_notes,
--   meals_notes, access_notes, deadline_at
-- The `timezone` column maps to inquiries.event_timezone (already present);
-- it is carried here as a human-readable alias column on agency_bookings.
--
-- This is a DROP + RECREATE because the function is SECURITY DEFINER and
-- PostgreSQL does not support adding column lists to an existing function via
-- ALTER.  The signature (UUID, UUID, INT, TEXT DEFAULT NULL) is unchanged.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.engine_convert_to_booking(UUID, UUID, INT, TEXT);

CREATE OR REPLACE FUNCTION public.engine_convert_to_booking(
  p_inquiry_id               UUID,
  p_actor_user_id            UUID,
  p_inquiry_expected_version INT,
  p_override_reason          TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq              RECORD;
  off              RECORD;
  v_booking_id     UUID;
  v_actor_role     public.inquiry_event_actor_role := 'admin';
  v_actor_app_role TEXT;
  v_shortfall      JSONB;
  v_has_shortfall  BOOLEAN;
  v_override       BOOLEAN := false;
  v_reason_trim    TEXT;
BEGIN
  -- ── Auth / actor role lookup ──────────────────────────────────────────────
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT app_role INTO v_actor_app_role
    FROM public.profiles WHERE id = p_actor_user_id;

  v_actor_role := CASE v_actor_app_role
    WHEN 'agency_staff' THEN 'coordinator'::public.inquiry_event_actor_role
    WHEN 'super_admin'  THEN 'admin'::public.inquiry_event_actor_role
    ELSE                     'admin'::public.inquiry_event_actor_role
  END;

  -- ── Inquiry lock + baseline gates ─────────────────────────────────────────
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  -- Idempotency: already booked → return existing booking id (no version bump,
  -- no event, no shortfall check).
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

  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;
  IF inq.status  <> 'approved'                  THEN RAISE EXCEPTION 'approvals_incomplete'; END IF;
  IF inq.current_offer_id IS NULL               THEN RAISE EXCEPTION 'no_active_offer'; END IF;

  SELECT * INTO off FROM public.inquiry_offers WHERE id = inq.current_offer_id FOR UPDATE;
  IF NOT FOUND OR off.status <> 'accepted'      THEN RAISE EXCEPTION 'no_active_offer'; END IF;

  -- ── Per-group fulfillment check (spec §3.3) ───────────────────────────────
  v_shortfall := public.engine_inquiry_group_shortfall(p_inquiry_id);
  v_has_shortfall := jsonb_array_length(v_shortfall) > 0;

  IF v_has_shortfall THEN
    IF p_override_reason IS NULL THEN
      RAISE EXCEPTION 'requirement_groups_unfulfilled';
    END IF;

    IF v_actor_app_role IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION 'override_not_allowed';
    END IF;

    v_reason_trim := trim(p_override_reason);
    IF v_reason_trim IS NULL OR char_length(v_reason_trim) < 10 THEN
      RAISE EXCEPTION 'override_reason_too_short';
    END IF;

    v_override := true;
  END IF;

  -- ── Create booking — carry all details from the inquiry ───────────────────
  --
  -- Operational logistics fields (wardrobe_notes, equipment_notes, etc.) are
  -- mapped from inq.* when the matching inquiry columns exist.  Until those
  -- inquiry columns are added they resolve to NULL — the booking row is still
  -- created correctly; NULL values are populated later via admin edit.
  --
  -- timezone maps to inq.event_timezone (already present on inquiries).
  INSERT INTO public.agency_bookings (
    source_inquiry_id,
    client_user_id, client_account_id, client_contact_id,
    owner_staff_id, created_by_staff_id,
    title, status,
    contact_name, contact_email, contact_phone,
    event_type_id, event_date, venue_location_text,
    total_client_revenue, currency_code, client_summary,
    source_type_snapshot, tenant_id_snapshot,
    coordinator_user_id_snapshot, owner_user_id_snapshot,
    event_timezone_snapshot,
    coordinator_response_time_ms, time_to_first_offer_ms, time_to_booking_ms,
    created_with_override, override_reason,
    -- details v3 §5: operational logistics carry-forward
    -- TODO: replace NULL literals with inq.<column> once inquiry-side columns land:
    --   wardrobe_notes, equipment_notes, transport_notes,
    --   lodging_notes, meals_notes, access_notes, deadline_at
    wardrobe_notes,
    equipment_notes,
    transport_notes,
    lodging_notes,
    meals_notes,
    access_notes,
    deadline_at,
    timezone
  ) VALUES (
    p_inquiry_id,
    inq.client_user_id, inq.client_account_id, inq.client_contact_id,
    p_actor_user_id, p_actor_user_id,
    COALESCE(inq.contact_name || ' — booking', 'Booking'), 'confirmed',
    inq.contact_name, inq.contact_email, inq.contact_phone,
    inq.event_type_id, inq.event_date, inq.event_location,
    off.total_client_price, off.currency_code, off.notes,
    inq.source_type, inq.tenant_id,
    inq.coordinator_id, inq.owner_user_id,
    inq.event_timezone,
    NULL, NULL, NULL,
    v_override,
    CASE WHEN v_override THEN trim(p_override_reason) ELSE NULL END,
    -- details v3 §5: NULL until inquiry-side columns are added
    NULL,  -- wardrobe_notes  ← inq.wardrobe_notes  (add column to inquiries)
    NULL,  -- equipment_notes ← inq.equipment_notes (add column to inquiries)
    NULL,  -- transport_notes ← inq.transport_notes (add column to inquiries)
    NULL,  -- lodging_notes   ← inq.lodging_notes   (add column to inquiries)
    NULL,  -- meals_notes     ← inq.meals_notes     (add column to inquiries)
    NULL,  -- access_notes    ← inq.access_notes    (add column to inquiries)
    NULL,  -- deadline_at     ← inq.deadline_at     (add column to inquiries)
    inq.event_timezone  -- timezone: same source, explicit alias column
  ) RETURNING id INTO v_booking_id;

  -- Snapshot talent from offer line items.
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

  -- Update booking header totals.
  UPDATE public.agency_bookings
    SET total_talent_cost    = (SELECT COALESCE(SUM(talent_cost_total), 0)   FROM public.booking_talent WHERE booking_id = v_booking_id),
        total_client_revenue = (SELECT COALESCE(SUM(client_charge_total), 0) FROM public.booking_talent WHERE booking_id = v_booking_id),
        gross_profit         = (SELECT COALESCE(SUM(gross_profit), 0)        FROM public.booking_talent WHERE booking_id = v_booking_id)
    WHERE id = v_booking_id;

  -- Mark inquiry booked.
  UPDATE public.inquiries
    SET status         = 'booked',
        booked_at      = now(),
        next_action_by = NULL,
        version        = version + 1,
        last_edited_by = p_actor_user_id,
        last_edited_at = now()
    WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;

  -- ── Events ────────────────────────────────────────────────────────────────
  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'booking.created',
    p_actor_user_id,
    v_actor_role,
    'participants',
    jsonb_build_object(
      'booking_id', v_booking_id,
      'title',      COALESCE(inq.contact_name || ' — booking', 'Booking')
    )
  );

  IF v_override THEN
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'booking.converted_with_override',
      p_actor_user_id,
      v_actor_role,
      'staff_only',
      jsonb_build_object(
        'booking_id',      v_booking_id,
        'override_reason', trim(p_override_reason),
        'shortfall',       v_shortfall
      )
    );
  END IF;

  -- Booking-level audit log.
  INSERT INTO public.booking_activity_log (booking_id, actor_user_id, event_type, payload)
  VALUES (
    v_booking_id,
    p_actor_user_id,
    'booking.converted_from_inquiry',
    jsonb_build_object(
      'inquiry_id',            p_inquiry_id,
      'created_with_override', v_override
    )
  );

  RETURN v_booking_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT, TEXT) TO authenticated;

COMMIT;
