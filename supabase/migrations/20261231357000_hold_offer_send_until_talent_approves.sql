-- Hold the offer send until every talent has approved (step B of
-- docs/plans/hold-offer-send-until-talent-approves-2026-10-09.md).
--
-- engine_send_offer puts an offer with a pending talent approval into `awaiting_talent` (staff and
-- talent only; every client reader keys on `sent`) and emits NO client-visible event.
-- engine_submit_approval: the last non-author talent approval releases it (`sent`, offer.sent for the
-- client); a talent rejection returns it to `draft` with her note in a staff-only event.
-- Signatures, grants and the anon revoke are unchanged (CREATE OR REPLACE keeps privileges).
-- Requires 20261231356000 (the enum value) to be applied first.
-- APPLY ORDER (PM): after the UI PR that renders awaiting_talent is live, just before this PR merges.

BEGIN;

-- One live commercial offer per inquiry now includes the held state (otherwise a second draft could
-- be created next to an awaiting_talent offer).
DROP INDEX IF EXISTS public.inquiry_offers_one_active_offer;
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_offers_one_active_offer
  ON public.inquiry_offers (inquiry_id)
  WHERE status IN ('draft', 'sent', 'accepted', 'awaiting_talent');

CREATE OR REPLACE FUNCTION public.enforce_inquiry_status_offer_pair()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  offer_st public.inquiry_offer_status;
  st text;
BEGIN
  IF TG_TABLE_NAME <> 'inquiries' THEN
    RETURN NEW;
  END IF;

  st := NEW.status::text;

  IF NEW.current_offer_id IS NULL THEN
    IF st IN ('offer_pending', 'approved', 'booked', 'converted') THEN
      RAISE EXCEPTION 'inquiry status % is incompatible with NULL current_offer_id', st;
    END IF;
    RETURN NEW;
  END IF;

  SELECT o.status INTO offer_st
  FROM public.inquiry_offers o
  WHERE o.id = NEW.current_offer_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF offer_st = 'superseded'::public.inquiry_offer_status THEN
    RETURN NEW;
  END IF;

  IF offer_st = 'draft'::public.inquiry_offer_status THEN
    IF st NOT IN (
      'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested'
    ) THEN
      RAISE EXCEPTION 'draft offer incompatible with inquiry status %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'sent'::public.inquiry_offer_status THEN
    IF st <> 'offer_pending' THEN
      RAISE EXCEPTION 'sent offer requires inquiry status offer_pending, got %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'awaiting_talent'::public.inquiry_offer_status THEN
    IF st <> 'offer_pending' THEN
      RAISE EXCEPTION 'awaiting_talent offer requires inquiry status offer_pending, got %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'accepted'::public.inquiry_offer_status THEN
    IF st NOT IN ('approved', 'booked', 'converted') THEN
      RAISE EXCEPTION 'accepted offer incompatible with inquiry status %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'rejected'::public.inquiry_offer_status THEN
    IF st NOT IN (
      'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested'
    ) THEN
      RAISE EXCEPTION 'rejected offer incompatible with inquiry status %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'invalidated'::public.inquiry_offer_status THEN
    IF st NOT IN (
      'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested',
      'offer_pending', 'closed_lost'
    ) THEN
      RAISE EXCEPTION 'invalidated offer incompatible with inquiry status %', st;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Pending approvals on an offer that block RELEASING it to the client: talent participants other
-- than the offer's own author (the sender's approval is implicit, as in acceptDirect). Agency staff
-- and the client's own row never count.
CREATE OR REPLACE FUNCTION public.offer_pending_talent_approvals(p_inquiry_id uuid, p_offer_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path = public
AS $f$
  SELECT count(*)::int
  FROM public.inquiry_approvals a
  JOIN public.inquiry_participants p ON p.id = a.participant_id
  JOIN public.inquiry_offers o ON o.id = a.offer_id
  LEFT JOIN public.talent_profiles tp ON tp.id = p.talent_profile_id
  WHERE a.inquiry_id = p_inquiry_id
    AND a.offer_id   = p_offer_id
    AND p.role       = 'talent'
    AND a.status    <> 'accepted'::public.inquiry_approval_status
    AND NOT (
      o.created_by_user_id IS NOT NULL
      AND (p.user_id = o.created_by_user_id OR tp.user_id = o.created_by_user_id)
    );
$f$;

-- Internal helper for the two SECURITY DEFINER engine functions below: nobody calls it directly.
REVOKE ALL ON FUNCTION public.offer_pending_talent_approvals(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $assert$
BEGIN
  IF has_function_privilege('anon', 'public.offer_pending_talent_approvals(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.offer_pending_talent_approvals(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('public', 'public.offer_pending_talent_approvals(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'offer_pending_talent_approvals must not be executable by anon, authenticated or PUBLIC';
  END IF;
END
$assert$;

CREATE OR REPLACE FUNCTION public.engine_send_offer(p_inquiry_id uuid, p_offer_id uuid, p_actor_user_id uuid, p_inquiry_expected_version integer, p_offer_expected_version integer)
 RETURNS TABLE(next_inquiry_version integer, next_offer_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  inq                   RECORD;
  off                   RECORD;
  client_participant_id UUID;
  v_actor_role          public.inquiry_event_actor_role := 'coordinator';
  v_hold                BOOLEAN := FALSE;
BEGIN
  -- Lock inquiry row.
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Lock offer row.
  SELECT * INTO off FROM public.inquiry_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR off.inquiry_id <> p_inquiry_id THEN RAISE EXCEPTION 'offer_not_found'; END IF;
  IF off.status IN ('sent', 'awaiting_talent') THEN
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
    WHERE inquiry_id = p_inquiry_id AND status IN ('sent', 'awaiting_talent');

  -- Send offer.
  UPDATE public.inquiry_offers
    SET status     = 'sent',
        sent_at    = now(),
        version    = version + 1,
        updated_at = now()
    WHERE id = p_offer_id AND version = p_offer_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Ensure the client's seat exists + active (Contract 8.1), WITH OR WITHOUT
  -- an account (20261231236000). A guest inquiry has `client_user_id NULL`;
  -- its seat is held by contact email until the person claims it, and the
  -- approval seeded below keeps the offer open until the client answers.
  -- Before this, an inquiry with no account seeded the talent's approval
  -- only, and the talent's yes read as "Client approved".
  SELECT id INTO client_participant_id
    FROM public.inquiry_participants
    WHERE inquiry_id = p_inquiry_id AND role = 'client' LIMIT 1;
  IF client_participant_id IS NULL THEN
    INSERT INTO public.inquiry_participants (inquiry_id, user_id, role, status)
    VALUES (p_inquiry_id, inq.client_user_id, 'client', 'active')
    RETURNING id INTO client_participant_id;
  ELSIF inq.client_user_id IS NOT NULL THEN
    UPDATE public.inquiry_participants
      SET user_id = inq.client_user_id
      WHERE id = client_participant_id AND user_id IS NULL;
  END IF;

  -- ── Audit #1: seed the CANONICAL must-approve set = client + offered talents ──
  -- "Offered talents" = talent participants with an inquiry_offer_line_items row
  -- for THIS offer (mapped by talent_profile_id). This replaces the old
  -- status='active' filter, which dropped a priced-but-still-invited talent.

  -- (1) Activate invited talents who are priced on this offer, so the talent
  --     shell surfaces the offer and they can approve. (Closes the 1J skip of
  --     existing invited participants. set_updated_at trigger stamps updated_at;
  --     accepted_at is intentionally left NULL until they actually approve.)
  UPDATE public.inquiry_participants p
    SET status = 'active'
    WHERE p.inquiry_id = p_inquiry_id
      AND p.role       = 'talent'
      AND p.status     = 'invited'
      AND EXISTS (
        SELECT 1 FROM public.inquiry_offer_line_items li
        WHERE li.offer_id          = p_offer_id
          AND li.talent_profile_id = p.talent_profile_id
      );

  -- (2a) Seed the client approval.
  IF client_participant_id IS NOT NULL THEN
    INSERT INTO public.inquiry_approvals (inquiry_id, offer_id, participant_id, status)
    VALUES (p_inquiry_id, p_offer_id, client_participant_id, 'pending')
    ON CONFLICT (inquiry_id, offer_id, participant_id) DO NOTHING;
  END IF;

  -- (2b) Seed approvals for the offered talents (line items), invited OR active.
  --      A lineup talent with NO line item is intentionally excluded. The EXISTS
  --      filter yields one row per participant, so no DISTINCT is needed (and a
  --      DISTINCT would force the untyped 'pending' literal to text, which then
  --      fails to coerce to the enum — so the literal is cast explicitly).
  INSERT INTO public.inquiry_approvals (inquiry_id, offer_id, participant_id, status)
  SELECT p_inquiry_id, p_offer_id, p.id, 'pending'::public.inquiry_approval_status
  FROM public.inquiry_participants p
  WHERE p.inquiry_id = p_inquiry_id
    AND p.role       = 'talent'
    AND p.status     IN ('invited', 'active')
    AND EXISTS (
      SELECT 1 FROM public.inquiry_offer_line_items li
      WHERE li.offer_id          = p_offer_id
        AND li.talent_profile_id = p.talent_profile_id
    )
  ON CONFLICT (inquiry_id, offer_id, participant_id) DO NOTHING;

  -- Hold-the-send (20261231357000): a talent on the offer (other than its own author) who has not
  -- approved yet means the CLIENT must not see it. It waits in awaiting_talent, visible to staff and
  -- talent only; the last talent approval releases it (engine_submit_approval).
  v_hold := public.offer_pending_talent_approvals(p_inquiry_id, p_offer_id) > 0;
  IF v_hold THEN
    UPDATE public.inquiry_offers
      SET status = 'awaiting_talent', updated_at = now()
      WHERE id = p_offer_id;
  END IF;

  -- Update inquiry derived state.
  UPDATE public.inquiries
    SET status           = 'offer_pending',
        current_offer_id = p_offer_id,
        next_action_by   = 'client',
        version          = version + 1,
        last_edited_by   = p_actor_user_id,
        last_edited_at   = now(),
        updated_at       = now()
    WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Emit: offer.sent (visible to participants, the client included) ONLY when it really went to the
  -- client; a held offer emits a staff-only event instead, so no client notification can fire.
  IF v_hold THEN
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'offer.awaiting_talent',
      p_actor_user_id,
      v_actor_role,
      'staff_only',
      jsonb_build_object(
        'offer_id',           p_offer_id,
        'total_client_price', off.total_client_price,
        'currency_code',      off.currency_code
      )
    );
  ELSE
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'offer.sent',
      p_actor_user_id,
      v_actor_role,
      'participants',
      jsonb_build_object(
        'offer_id',           p_offer_id,
        'total_client_price', off.total_client_price,
        'currency_code',      off.currency_code
      )
    );
  END IF;

  next_inquiry_version := p_inquiry_expected_version + 1;
  next_offer_version   := p_offer_expected_version + 1;
  RETURN NEXT;
END;
$function$;

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
  off          RECORD;
  v_held       BOOLEAN := FALSE;
  v_vis        public.inquiry_event_visibility := 'participants';
BEGIN
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;

  -- Hold-the-send: is this offer waiting on talent approval (invisible to the client)?
  SELECT * INTO off FROM public.inquiry_offers WHERE id = p_offer_id AND inquiry_id = p_inquiry_id;
  IF FOUND THEN v_held := (off.status = 'awaiting_talent'); END IF;
  IF v_held THEN v_vis := 'staff_only'; END IF;

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

  IF p_decision = 'rejected' AND v_held THEN
    -- A talent declined a held offer: it goes back to staff as a DRAFT (its pointer kept so staff
    -- see it), her note is in the event payload, and the approval rows are cleared so a re-send
    -- seeds fresh ones. The client never saw it and is told nothing.
    UPDATE public.inquiry_offers SET status = 'draft', updated_at = now() WHERE id = p_offer_id;
    DELETE FROM public.inquiry_approvals WHERE inquiry_id = p_inquiry_id AND offer_id = p_offer_id;
    UPDATE public.inquiries
      SET status         = 'coordination',
          next_action_by = 'coordinator',
          version        = version + 1,
          last_edited_by = p_actor_user_id,
          last_edited_at = now()
      WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'approval.rejected',
      p_actor_user_id,
      v_actor_role,
      'staff_only',
      jsonb_build_object('offer_id', p_offer_id, 'participant_id', p_participant_id, 'reason', p_notes, 'returned_to_draft', true)
    );
    RETURN jsonb_build_object('already', false, 'transition', 'returned_to_draft', 'next_inquiry_version', p_inquiry_expected_version + 1);
  END IF;

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

  -- The last talent approval on a held offer RELEASES it to the client: it becomes `sent` and the
  -- client gets it (the app stamps valid_until and emits the client notification on this transition).
  IF v_held AND public.offer_pending_talent_approvals(p_inquiry_id, p_offer_id) = 0 THEN
    UPDATE public.inquiry_offers SET status = 'sent', updated_at = now() WHERE id = p_offer_id AND status = 'awaiting_talent';
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'approval.approved',
      p_actor_user_id,
      v_actor_role,
      'staff_only',
      jsonb_build_object('offer_id', p_offer_id, 'participant_id', p_participant_id)
    );
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'offer.sent',
      p_actor_user_id,
      v_actor_role,
      'participants',
      jsonb_build_object('offer_id', p_offer_id, 'total_client_price', off.total_client_price, 'currency_code', off.currency_code)
    );
    RETURN jsonb_build_object('already', false, 'transition', 'released_to_client', 'next_inquiry_version', p_inquiry_expected_version);
  END IF;

  -- Not yet all approved: emit per-participant approval event only.
  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'approval.approved',
    p_actor_user_id,
    v_actor_role,
    v_vis,
    jsonb_build_object(
      'offer_id',       p_offer_id,
      'participant_id', p_participant_id
    )
  );

  RETURN jsonb_build_object('already', false, 'transition', 'none', 'next_inquiry_version', p_inquiry_expected_version);
END;
$$;

COMMIT;
