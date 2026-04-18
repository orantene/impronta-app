-- Wire all engine RPCs to emit canonical inquiry_events.
--
-- Replaces all INSERT INTO inquiry_activity_log with PERFORM engine_emit_event(...)
-- inside: engine_cancel_inquiry, engine_send_offer, engine_submit_approval,
--         engine_convert_to_booking.
--
-- Signatures are UNCHANGED — callers are unaffected.
-- Business logic is UNCHANGED — only the audit write target changes.
--
-- Actor role detection: each function resolves the actor_role from either:
--   a) The known call context (cancel → always 'client')
--   b) profiles.app_role lookup for staff actions
--   c) inquiry_participants.role lookup for approval submissions
--
-- Events emitted per RPC:
--   engine_cancel_inquiry        → inquiry.cancelled           (visibility: participants)
--                                   participant.status_changed for each removed talent (participants)
--   engine_send_offer            → offer.sent                  (visibility: participants)
--   engine_submit_approval       → approval.approved / approval.rejected (participants)
--                                   offer.accepted when all_accepted = TRUE (participants)
--   engine_convert_to_booking    → booking.created             (visibility: participants)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. engine_cancel_inquiry
-- ─────────────────────────────────────────────────────────────────────────────
-- Actor is always the client (enforced by auth guard in the function body).

CREATE OR REPLACE FUNCTION public.engine_cancel_inquiry(
  p_inquiry_id    UUID,
  p_actor_user_id UUID,
  p_reason        TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq RECORD;
BEGIN
  -- Lock the inquiry row for the duration of this transaction.
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- Auth guard: caller must be the authenticated user and the inquiry's client.
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF inq.client_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Status guard: only cancelable in pre-booking stages.
  IF inq.status NOT IN ('draft', 'submitted', 'coordination', 'offer_pending') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  -- Frozen guard.
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  -- Booking guard: cannot cancel if a booking already exists.
  IF EXISTS (
    SELECT 1 FROM public.agency_bookings WHERE source_inquiry_id = p_inquiry_id
  ) THEN
    RAISE EXCEPTION 'booking_exists';
  END IF;

  -- Effect 1: close the inquiry.
  UPDATE public.inquiries
    SET status         = 'rejected',
        closed_reason  = 'client_cancelled',
        next_action_by = NULL,
        version        = version + 1,
        last_edited_by = p_actor_user_id,
        last_edited_at = now(),
        updated_at     = now()
    WHERE id = p_inquiry_id;

  -- Effect 2: remove active talent participants.
  UPDATE public.inquiry_participants
    SET status     = 'removed',
        removed_at = now(),
        updated_at = now()
    WHERE inquiry_id = p_inquiry_id
      AND role       = 'talent'
      AND status     = 'active';

  -- Emit: inquiry.cancelled
  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'inquiry.cancelled',
    p_actor_user_id,
    'client',
    'participants',
    jsonb_build_object(
      'reason',          p_reason,
      'previous_status', inq.status
    )
  );

  -- Emit: participant.status_changed for each removed talent
  -- (one event per removed participant so the timeline is granular)
  INSERT INTO public.inquiry_events (
    inquiry_id, event_type, actor_user_id, actor_role, visibility, payload
  )
  SELECT
    p_inquiry_id,
    'participant.status_changed',
    p_actor_user_id,
    'client',
    'participants',
    jsonb_build_object(
      'participant_id',     ip.id,
      'talent_profile_id',  ip.talent_profile_id,
      'from_status',        'active',
      'to_status',          'removed'
    )
  FROM public.inquiry_participants ip
  WHERE ip.inquiry_id = p_inquiry_id
    AND ip.role       = 'talent'
    AND ip.status     = 'removed'
    AND ip.removed_at >= now() - interval '5 seconds';
  -- 5-second window: catches only the participants just removed above.
  -- Tight enough that concurrent operations on other inquiries are not affected.
END;
$$;

REVOKE ALL ON FUNCTION public.engine_cancel_inquiry(UUID, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.engine_cancel_inquiry(UUID, UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. engine_send_offer
-- ─────────────────────────────────────────────────────────────────────────────
-- Actor is always staff. Detect admin vs coordinator from profiles.app_role.

CREATE OR REPLACE FUNCTION public.engine_send_offer(
  p_inquiry_id             UUID,
  p_offer_id               UUID,
  p_actor_user_id          UUID,
  p_inquiry_expected_version INT,
  p_offer_expected_version   INT
) RETURNS TABLE (
  next_inquiry_version INT,
  next_offer_version   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq                RECORD;
  off                RECORD;
  client_participant_id UUID;
  v_actor_role       public.inquiry_event_actor_role := 'coordinator';
BEGIN
  -- Lock inquiry row.
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Lock offer row.
  SELECT * INTO off FROM public.inquiry_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR off.inquiry_id <> p_inquiry_id THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF off.status = 'sent' THEN
    next_inquiry_version := inq.version;
    next_offer_version   := off.version;
    RETURN NEXT;
    RETURN;
  END IF;
  IF off.version <> p_offer_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Detect actor role from profiles.
  SELECT CASE p.app_role
    WHEN 'super_admin' THEN 'admin'::public.inquiry_event_actor_role
    ELSE 'coordinator'::public.inquiry_event_actor_role
  END INTO v_actor_role
  FROM public.profiles p WHERE p.id = p_actor_user_id;
  v_actor_role := COALESCE(v_actor_role, 'coordinator');

  -- Supersede any previous sent offer.
  UPDATE public.inquiry_offers
    SET status = 'superseded', updated_at = now()
    WHERE inquiry_id = p_inquiry_id AND status = 'sent';

  -- Send offer.
  UPDATE public.inquiry_offers
    SET status     = 'sent',
        sent_at    = now(),
        version    = version + 1,
        updated_at = now()
    WHERE id = p_offer_id AND version = p_offer_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Ensure client participant exists + active (Contract 8.1).
  IF inq.client_user_id IS NOT NULL THEN
    SELECT id INTO client_participant_id
      FROM public.inquiry_participants
      WHERE inquiry_id = p_inquiry_id AND role = 'client' LIMIT 1;
    IF client_participant_id IS NULL THEN
      INSERT INTO public.inquiry_participants (inquiry_id, user_id, role, status)
      VALUES (p_inquiry_id, inq.client_user_id, 'client', 'active')
      RETURNING id INTO client_participant_id;
    END IF;
  END IF;

  -- Seed approvals: client + active talents (Section 2.8).
  IF client_participant_id IS NOT NULL THEN
    INSERT INTO public.inquiry_approvals (inquiry_id, offer_id, participant_id, status)
    VALUES (p_inquiry_id, p_offer_id, client_participant_id, 'pending')
    ON CONFLICT (inquiry_id, offer_id, participant_id) DO NOTHING;
  END IF;

  INSERT INTO public.inquiry_approvals (inquiry_id, offer_id, participant_id, status)
  SELECT p_inquiry_id, p_offer_id, p.id, 'pending'
  FROM public.inquiry_participants p
  WHERE p.inquiry_id = p_inquiry_id
    AND p.role       = 'talent'
    AND p.status     = 'active'
  ON CONFLICT (inquiry_id, offer_id, participant_id) DO NOTHING;

  -- Update inquiry derived state.
  UPDATE public.inquiries
    SET status         = 'offer_pending',
        current_offer_id = p_offer_id,
        next_action_by = 'client',
        version        = version + 1,
        last_edited_by = p_actor_user_id,
        last_edited_at = now(),
        updated_at     = now()
    WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Emit: offer.sent (visible to participants — client needs to know an offer arrived)
  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'offer.sent',
    p_actor_user_id,
    v_actor_role,
    'participants',
    jsonb_build_object(
      'offer_id',          p_offer_id,
      'total_client_price', off.total_client_price,
      'currency_code',     off.currency_code
    )
  );

  next_inquiry_version := p_inquiry_expected_version + 1;
  next_offer_version   := p_offer_expected_version + 1;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.engine_send_offer(UUID, UUID, UUID, INT, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.engine_send_offer(UUID, UUID, UUID, INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. engine_submit_approval
-- ─────────────────────────────────────────────────────────────────────────────
-- Actor is a participant (client or talent). Detect role from inquiry_participants.

CREATE OR REPLACE FUNCTION public.engine_submit_approval(
  p_inquiry_id             UUID,
  p_offer_id               UUID,
  p_participant_id         UUID,
  p_actor_user_id          UUID,
  p_inquiry_expected_version INT,
  p_decision               TEXT,
  p_notes                  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq          RECORD;
  all_accepted BOOLEAN;
  already      BOOLEAN := FALSE;
  v_actor_role public.inquiry_event_actor_role := 'client';
BEGIN
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Detect actor role from participant record.
  SELECT CASE ip.role
    WHEN 'talent'      THEN 'talent'::public.inquiry_event_actor_role
    WHEN 'coordinator' THEN 'coordinator'::public.inquiry_event_actor_role
    ELSE 'client'::public.inquiry_event_actor_role
  END INTO v_actor_role
  FROM public.inquiry_participants ip WHERE ip.id = p_participant_id;
  v_actor_role := COALESCE(v_actor_role, 'client');

  -- Idempotency: already accepted stays accepted (no event emitted).
  IF p_decision = 'accepted' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.inquiry_approvals a
      WHERE a.inquiry_id     = p_inquiry_id
        AND a.offer_id       = p_offer_id
        AND a.participant_id = p_participant_id
        AND a.status         = 'accepted'::public.inquiry_approval_status
    ) INTO already;
    IF already THEN
      RETURN jsonb_build_object('already', true, 'transition', 'none', 'next_inquiry_version', inq.version);
    END IF;
  END IF;

  -- Write the approval.
  INSERT INTO public.inquiry_approvals (inquiry_id, offer_id, participant_id, status, decided_at, notes)
  VALUES (p_inquiry_id, p_offer_id, p_participant_id, p_decision::public.inquiry_approval_status, now(), p_notes)
  ON CONFLICT (inquiry_id, offer_id, participant_id) DO UPDATE
    SET status     = EXCLUDED.status,
        decided_at = EXCLUDED.decided_at,
        notes      = EXCLUDED.notes,
        updated_at = now();

  IF p_decision = 'rejected' THEN
    UPDATE public.inquiries
      SET status           = 'coordination',
          next_action_by   = 'coordinator',
          current_offer_id = NULL,
          version          = version + 1,
          last_edited_by   = p_actor_user_id,
          last_edited_at   = now()
      WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;

    -- Emit: approval.rejected (per-participant)
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'approval.rejected',
      p_actor_user_id,
      v_actor_role,
      'participants',
      jsonb_build_object(
        'offer_id',       p_offer_id,
        'participant_id', p_participant_id,
        'reason',         p_notes
      )
    );

    RETURN jsonb_build_object('already', false, 'transition', 'rejected_to_coordination', 'next_inquiry_version', p_inquiry_expected_version + 1);
  END IF;

  -- Check if all approvals are now accepted.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.inquiry_approvals a
    WHERE a.inquiry_id = p_inquiry_id
      AND a.offer_id   = p_offer_id
      AND a.status     <> 'accepted'::public.inquiry_approval_status
  ) INTO all_accepted;

  IF all_accepted THEN
    UPDATE public.inquiry_offers
      SET status      = 'accepted',
          accepted_at = now(),
          updated_at  = now()
      WHERE id = p_offer_id;

    UPDATE public.inquiries
      SET status         = 'approved',
          next_action_by = 'coordinator',
          version        = version + 1,
          last_edited_by = p_actor_user_id,
          last_edited_at = now()
      WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;

    -- Emit: approval.approved (per-participant)
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'approval.approved',
      p_actor_user_id,
      v_actor_role,
      'participants',
      jsonb_build_object(
        'offer_id',       p_offer_id,
        'participant_id', p_participant_id
      )
    );

    -- Emit: offer.accepted (offer-level — all approvals complete)
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'offer.accepted',
      p_actor_user_id,
      v_actor_role,
      'participants',
      jsonb_build_object('offer_id', p_offer_id)
    );

    RETURN jsonb_build_object('already', false, 'transition', 'approved', 'next_inquiry_version', p_inquiry_expected_version + 1);
  END IF;

  -- Not yet all approved: emit per-participant approval event only.
  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'approval.approved',
    p_actor_user_id,
    v_actor_role,
    'participants',
    jsonb_build_object(
      'offer_id',       p_offer_id,
      'participant_id', p_participant_id
    )
  );

  RETURN jsonb_build_object('already', false, 'transition', 'none', 'next_inquiry_version', p_inquiry_expected_version);
END;
$$;

REVOKE ALL ON FUNCTION public.engine_submit_approval(UUID, UUID, UUID, UUID, INT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.engine_submit_approval(UUID, UUID, UUID, UUID, INT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. engine_convert_to_booking
-- ─────────────────────────────────────────────────────────────────────────────
-- Actor is admin or coordinator. Detect from profiles.app_role.

CREATE OR REPLACE FUNCTION public.engine_convert_to_booking(
  p_inquiry_id             UUID,
  p_actor_user_id          UUID,
  p_inquiry_expected_version INT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq          RECORD;
  off          RECORD;
  v_booking_id UUID;
  v_actor_role public.inquiry_event_actor_role := 'admin';
BEGIN
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Detect actor role.
  SELECT CASE p.app_role
    WHEN 'agency_staff' THEN 'coordinator'::public.inquiry_event_actor_role
    ELSE 'admin'::public.inquiry_event_actor_role
  END INTO v_actor_role
  FROM public.profiles p WHERE p.id = p_actor_user_id;
  v_actor_role := COALESCE(v_actor_role, 'admin');

  -- Idempotency: already booked → return existing booking id.
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
    coordinator_response_time_ms, time_to_first_offer_ms, time_to_booking_ms
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
    NULL, NULL, NULL
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

  -- Emit: booking.created (visible to all participants)
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

  -- Booking-level audit log (separate system, unchanged).
  INSERT INTO public.booking_activity_log (booking_id, actor_user_id, event_type, payload)
  VALUES (v_booking_id, p_actor_user_id, 'booking.converted_from_inquiry', jsonb_build_object('inquiry_id', p_inquiry_id));

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT) TO authenticated;

COMMIT;
