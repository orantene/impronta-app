-- Fix: engine_submit_approval was inserting p_decision TEXT into status column
-- typed as inquiry_approval_status enum without explicit cast, causing runtime error.

BEGIN;

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
  IF inq.uses_new_engine IS NOT TRUE THEN RAISE EXCEPTION 'legacy_inquiry'; END IF;
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

  -- Explicit cast TEXT → enum to satisfy strict type checking
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

  -- all accepted?
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

COMMIT;
