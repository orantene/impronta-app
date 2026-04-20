-- engine_cancel_inquiry: client-initiated cancellation of an in-flight inquiry.
--
-- Guards (server-side):
--   1. Caller (p_actor_user_id) must be auth.uid() and match inquiries.client_user_id.
--   2. Status must be in {draft, submitted, coordination, offer_pending}. Block approved/booked/locked.
--   3. No agency_bookings row with source_inquiry_id = p_inquiry_id.
--
-- Effects:
--   - inquiry.status = 'rejected', closed_reason = 'client_cancelled', updated_at = now().
--   - inquiry_participants rows with role='talent' AND status='active' → status='removed'.
--   - Audit log entry.
--
-- Note: inquiry_events table does not exist yet; no event emitted.

BEGIN;

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

  -- Frozen guard (matches existing engine pattern).
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  -- Booking guard: cannot cancel if a booking already exists.
  IF EXISTS (
    SELECT 1 FROM public.agency_bookings WHERE source_inquiry_id = p_inquiry_id
  ) THEN
    RAISE EXCEPTION 'booking_exists';
  END IF;

  -- Effect 1: close the inquiry.
  UPDATE public.inquiries
    SET status       = 'rejected',
        closed_reason = 'client_cancelled',
        next_action_by = NULL,
        version       = version + 1,
        last_edited_by = p_actor_user_id,
        last_edited_at = now(),
        updated_at    = now()
    WHERE id = p_inquiry_id;

  -- Effect 2: remove active talent participants.
  UPDATE public.inquiry_participants
    SET status     = 'removed',
        removed_at = now(),
        updated_at = now()
    WHERE inquiry_id  = p_inquiry_id
      AND role        = 'talent'
      AND status      = 'active';

  -- Audit log (no inquiry_events table yet).
  INSERT INTO public.inquiry_activity_log (inquiry_id, actor_user_id, event_type, payload)
  VALUES (
    p_inquiry_id,
    p_actor_user_id,
    'inquiry.client_cancelled',
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.engine_cancel_inquiry(UUID, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.engine_cancel_inquiry(UUID, UUID, TEXT) TO authenticated;

COMMIT;
