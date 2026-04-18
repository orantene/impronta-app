-- Final system lock: drop the `uses_new_engine` cutover flag.
--
-- Background: `uses_new_engine` was the Phase-2 gate that let the legacy and
-- new inquiry engines coexist. After the Phase-3 cleanup every runtime read
-- site was removed (see regression guard
-- `web/src/lib/inquiry/inquiry-legacy-surface.test.ts`). The backfill in
-- 20260522000000 ensured every row is `uses_new_engine = TRUE`, so no
-- production row is gated out by the guard any longer.
--
-- The only remaining references were three SECURITY DEFINER RPCs
-- (`engine_send_offer`, `engine_submit_approval`, `engine_convert_to_booking`)
-- that raised `legacy_inquiry` / `legacy_use_convert_flow` when the flag was
-- not TRUE. Since every inquiry is now on the new engine, the guard is
-- redundant — we replace each RPC with its Phase-3 body sans the flag check,
-- then drop the column and its index.
--
-- Idempotent: DROP INDEX / DROP COLUMN use IF EXISTS; the CREATE OR REPLACE
-- on RPCs is naturally idempotent.
--
-- This migration DOES NOT change RPC signatures or grants. Runtime callers
-- are unaffected.

BEGIN;

-- 1) Drop the now-orphaned partial index on inquiries.uses_new_engine.
DROP INDEX IF EXISTS public.idx_inquiries_uses_new_engine;

-- 2) Re-define engine_send_offer without the uses_new_engine guard.
CREATE OR REPLACE FUNCTION public.engine_send_offer(
  p_inquiry_id UUID,
  p_offer_id UUID,
  p_actor_user_id UUID,
  p_inquiry_expected_version INT,
  p_offer_expected_version INT
) RETURNS TABLE (
  next_inquiry_version INT,
  next_offer_version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq RECORD;
  off RECORD;
  client_participant_id UUID;
BEGIN
  -- Lock inquiry row (Section 2.9)
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Lock offer row
  SELECT * INTO off FROM public.inquiry_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR off.inquiry_id <> p_inquiry_id THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF off.status = 'sent' THEN
    next_inquiry_version := inq.version;
    next_offer_version := off.version;
    RETURN NEXT;
    RETURN;
  END IF;
  IF off.version <> p_offer_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Supersede any previous sent offer
  UPDATE public.inquiry_offers
    SET status = 'superseded', updated_at = now()
    WHERE inquiry_id = p_inquiry_id AND status = 'sent';

  -- Send offer
  UPDATE public.inquiry_offers
    SET status = 'sent',
        sent_at = now(),
        version = version + 1,
        updated_at = now()
    WHERE id = p_offer_id AND version = p_offer_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Ensure client participant exists + active (Contract 8.1)
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

  -- Seed approvals: client + active talents (Section 2.8)
  IF client_participant_id IS NOT NULL THEN
    INSERT INTO public.inquiry_approvals (inquiry_id, offer_id, participant_id, status)
    VALUES (p_inquiry_id, p_offer_id, client_participant_id, 'pending')
    ON CONFLICT (inquiry_id, offer_id, participant_id) DO NOTHING;
  END IF;

  INSERT INTO public.inquiry_approvals (inquiry_id, offer_id, participant_id, status)
  SELECT p_inquiry_id, p_offer_id, p.id, 'pending'
  FROM public.inquiry_participants p
  WHERE p.inquiry_id = p_inquiry_id
    AND p.role = 'talent'
    AND p.status = 'active'
  ON CONFLICT (inquiry_id, offer_id, participant_id) DO NOTHING;

  -- Update inquiry derived state
  UPDATE public.inquiries
    SET status = 'offer_pending',
        current_offer_id = p_offer_id,
        next_action_by = 'client',
        version = version + 1,
        last_edited_by = p_actor_user_id,
        last_edited_at = now(),
        updated_at = now()
    WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Audit log (inside the transaction per Section 2.4)
  INSERT INTO public.inquiry_activity_log (inquiry_id, actor_user_id, event_type, payload)
  VALUES (p_inquiry_id, p_actor_user_id, 'offer_sent', jsonb_build_object('offer_id', p_offer_id));

  next_inquiry_version := p_inquiry_expected_version + 1;
  next_offer_version := p_offer_expected_version + 1;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.engine_send_offer(UUID, UUID, UUID, INT, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.engine_send_offer(UUID, UUID, UUID, INT, INT) TO authenticated;

-- 3) Re-define engine_submit_approval without the uses_new_engine guard.
--    Body matches 20260520120000 (enum-cast fix).
CREATE OR REPLACE FUNCTION public.engine_submit_approval(
  p_inquiry_id UUID,
  p_offer_id UUID,
  p_participant_id UUID,
  p_actor_user_id UUID,
  p_inquiry_expected_version INT,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq RECORD;
  all_accepted BOOLEAN;
  already BOOLEAN := FALSE;
BEGIN
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Idempotency: already accepted stays accepted
  IF p_decision = 'accepted' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.inquiry_approvals a
      WHERE a.inquiry_id = p_inquiry_id
        AND a.offer_id = p_offer_id
        AND a.participant_id = p_participant_id
        AND a.status = 'accepted'::inquiry_approval_status
    ) INTO already;
    IF already THEN
      RETURN jsonb_build_object('already', true, 'transition', 'none', 'next_inquiry_version', inq.version);
    END IF;
  END IF;

  INSERT INTO public.inquiry_approvals (inquiry_id, offer_id, participant_id, status, decided_at, notes)
  VALUES (p_inquiry_id, p_offer_id, p_participant_id, p_decision::inquiry_approval_status, now(), p_notes)
  ON CONFLICT (inquiry_id, offer_id, participant_id) DO UPDATE
    SET status = EXCLUDED.status,
        decided_at = EXCLUDED.decided_at,
        notes = EXCLUDED.notes,
        updated_at = now();

  INSERT INTO public.inquiry_activity_log (inquiry_id, actor_user_id, event_type, payload)
  VALUES (p_inquiry_id, p_actor_user_id, 'approval_submitted', jsonb_build_object('offer_id', p_offer_id, 'decision', p_decision));

  IF p_decision = 'rejected' THEN
    UPDATE public.inquiries
      SET status = 'coordination',
          next_action_by = 'coordinator',
          current_offer_id = NULL,
          version = version + 1,
          last_edited_by = p_actor_user_id,
          last_edited_at = now()
      WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;
    RETURN jsonb_build_object('already', false, 'transition', 'rejected_to_coordination', 'next_inquiry_version', p_inquiry_expected_version + 1);
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.inquiry_approvals a
    WHERE a.inquiry_id = p_inquiry_id
      AND a.offer_id = p_offer_id
      AND a.status <> 'accepted'::inquiry_approval_status
  ) INTO all_accepted;

  IF all_accepted THEN
    UPDATE public.inquiry_offers
      SET status = 'accepted',
          accepted_at = now(),
          updated_at = now()
      WHERE id = p_offer_id;

    UPDATE public.inquiries
      SET status = 'approved',
          next_action_by = 'coordinator',
          version = version + 1,
          last_edited_by = p_actor_user_id,
          last_edited_at = now()
      WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;

    RETURN jsonb_build_object('already', false, 'transition', 'approved', 'next_inquiry_version', p_inquiry_expected_version + 1);
  END IF;

  RETURN jsonb_build_object('already', false, 'transition', 'none', 'next_inquiry_version', p_inquiry_expected_version);
END;
$$;

REVOKE ALL ON FUNCTION public.engine_submit_approval(UUID, UUID, UUID, UUID, INT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.engine_submit_approval(UUID, UUID, UUID, UUID, INT, TEXT, TEXT) TO authenticated;

-- 4) Re-define engine_convert_to_booking without the uses_new_engine guard.
--    Body matches 20260520140000 (v_booking_id var-rename fix).
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
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

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

  UPDATE public.agency_bookings
    SET total_talent_cost    = (SELECT COALESCE(SUM(talent_cost_total), 0)   FROM public.booking_talent WHERE booking_id = v_booking_id),
        total_client_revenue = (SELECT COALESCE(SUM(client_charge_total), 0) FROM public.booking_talent WHERE booking_id = v_booking_id),
        gross_profit         = (SELECT COALESCE(SUM(gross_profit), 0)        FROM public.booking_talent WHERE booking_id = v_booking_id)
    WHERE id = v_booking_id;

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

-- 5) Finally, drop the column. Safe now that no function body references it.
ALTER TABLE public.inquiries
  DROP COLUMN IF EXISTS uses_new_engine;

COMMIT;
