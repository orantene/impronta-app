-- The client's seat in the offer gate no longer requires an account.
--
-- WHY. `ensureGuestClientByEmail` stopped minting auth users for guests (the
-- inquiry-time createUser path littered production with throwaway
-- identities), so a guest who writes to a workspace now has an inquiry with
-- `client_user_id IS NULL`. `inquiry_participants_role_client_requires_user`
-- (20260523000000) then made it impossible to seat that client on the
-- inquiry, and `seedApprovalsForOffer` seeded a sent offer's approvals from
-- the TALENT only: the talent's approval settled the offer and the inquiry
-- read "Client approved" for a client who had never seen it (C08, cases run
-- 2026-09-11, fix-cases 2026-09-12: offer a9365298 accepted with one approval
-- row). The client party is the inquiry's contact; an account is how they
-- ACT on it, not whether they exist. A client participant with `user_id NULL`
-- is that guest seat; the claim (`claimInquiriesForConfirmedEmail`) fills
-- `user_id` when the person signs in with the inquiry's confirmed email, and
-- only then can they approve (`clientAcceptOffer` keys on `user_id`).
--
-- What stays: the coordinator and talent invariants, RLS keyed on
-- `user_id = auth.uid()` (a NULL never matches, so a guest seat is readable
-- by nobody until it is claimed), and `inquiries.client_user_id` as the
-- account link.

BEGIN;

ALTER TABLE public.inquiry_participants
  DROP CONSTRAINT IF EXISTS inquiry_participants_role_client_requires_user;

-- `engine_send_offer` seats the client whether or not an account exists;
-- body otherwise identical to 20261016074247 (grants and the 20261124 anon
-- revoke are kept: CREATE OR REPLACE preserves privileges).
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

  -- Emit: offer.sent (visible to participants — client needs to know an offer arrived)
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

  next_inquiry_version := p_inquiry_expected_version + 1;
  next_offer_version   := p_offer_expected_version + 1;
  RETURN NEXT;
END;
$function$;

COMMENT ON COLUMN public.inquiry_participants.user_id IS
  'The account acting for this participant. NULL on a client seat that a guest holds by contact email until the inquiry is claimed (20261231236000), and on legacy talent rows added before the talent claimed their profile.';

COMMIT;
