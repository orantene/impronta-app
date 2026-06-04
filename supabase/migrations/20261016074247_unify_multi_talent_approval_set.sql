-- Audit #1 — Unify the multi-talent "who must approve" set.
-- Ref: memory project_inquiry_booking_audit.md (#1, "deep analysis 2026-06-02").
--
-- PROBLEM (three populations disagreed on "who must approve" an offer):
--   A. SEED  (engine_send_offer)            seeded approvals for client + talent
--      participants WHERE status = 'active' ONLY.
--   B. GATE  (engine_submit_approval)       flips the inquiry to 'approved' when
--      no approval row for the offer is non-accepted — i.e. it only checks rows
--      that EXIST.
--   C. CONVERT (engine_inquiry_group_shortfall, called by engine_convert_to_booking)
--      blocked unless, per requirement group, the stored quantity_required was met
--      by accepted approvals among status IN ('invited','active') talents.
--
--   1J (ensureOfferTalentsOnLineup, TS) inserts a *missing* line-item talent as
--   'active', but SKIPS a talent already on the roster at status='invited' — so a
--   priced-but-still-invited talent was never flipped, never seeded (A), so the
--   gate (B) ignored them and the inquiry reached 'approved' prematurely, yet
--   convert (C) counted them against quantity_required → a legitimately-approved
--   multi-talent inquiry could NOT convert (false shortfall). quantity_required
--   is set at group creation and never re-derived, so it also drifts from the
--   real offered headcount in either direction.
--
-- CANONICAL SET (this migration makes A and C agree on it; B follows for free):
--   the CLIENT + the talents actually ON THE OFFER — i.e. talent participants
--   with an inquiry_offer_line_items row for the current offer (mapped by
--   talent_profile_id). A lineup talent with NO line item is intentionally NOT
--   required to approve (seeding them would deadlock the all-accepted gate on an
--   offer that doesn't include them).
--
-- FIX:
--   1. engine_send_offer: (a) flip every INVITED talent who is priced on the
--      offer to 'active' (so the talent shell surfaces the offer and they can
--      approve — closing the 1J skip); (b) seed pending approvals for exactly the
--      line-item talent set (+ the client), instead of the status='active' set.
--   2. engine_inquiry_group_shortfall: count the SAME offered (line-item) set per
--      group — required = offered headcount, approved = those accepted — instead
--      of the stored, drift-prone quantity_required. The JSON keeps the
--      `shortfall = quantity_required - approved_count` contract that
--      EngineErr.shortfall / inquiry-fulfillment.ts consumers rely on, by
--      reporting the offered headcount under `quantity_required` (and also as a
--      new explicit `offered_count`).
--
-- DELIBERATELY UNCHANGED:
--   * engine_submit_approval — its all-accepted check ("no non-accepted approval
--     row for the offer") becomes correct automatically once the seeded set is the
--     canonical set. Left as-is to minimise blast radius on the hottest path. If a
--     seeded talent later DECLINES, their pending row keeps the inquiry from
--     auto-approving (fail-closed → re-coordinate), which is the safe behaviour.
--   * engine_convert_to_booking — signature, idempotent re-convert, the 4-arg
--     super_admin override path, and the booking/booking_talent snapshot are all
--     unchanged. It still calls engine_inquiry_group_shortfall, which now never
--     reports a false shortfall for a fully-approved offer (so the normal flow no
--     longer needs an override); the override path remains for forced/anomalous
--     states.
--
-- Validated before ship by seeding a 2-talent inquiry on the live schema and
-- proving: old shortfall false-blocks a fully-approved offer (invited-unseeded
-- talent, and stale quantity_required), the new seed/flip set includes the invited
-- line-item talent, the new shortfall returns [] for the fully-approved offer, and
-- the single-talent happy path is unchanged.

BEGIN;

-- =============================================================================
-- 1. engine_send_offer — seed the canonical (line-item) set + activate them.
--    Signature unchanged (CREATE OR REPLACE preserves grants).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.engine_send_offer(
  p_inquiry_id               uuid,
  p_offer_id                 uuid,
  p_actor_user_id            uuid,
  p_inquiry_expected_version integer,
  p_offer_expected_version   integer
)
 RETURNS TABLE(next_inquiry_version integer, next_offer_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

REVOKE ALL     ON FUNCTION public.engine_send_offer(uuid, uuid, uuid, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_send_offer(uuid, uuid, uuid, integer, integer) TO authenticated;

-- =============================================================================
-- 2. engine_inquiry_group_shortfall — gate on the offered (line-item) set.
--    Signature unchanged. Output keeps the 5 contract keys (shortfall =
--    quantity_required - approved_count) and adds an explicit offered_count.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.engine_inquiry_group_shortfall(
  p_inquiry_id uuid
) RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH current_offer AS (
    SELECT current_offer_id AS offer_id FROM public.inquiries WHERE id = p_inquiry_id
  ),
  -- Audit #1: the gating population is the talents actually ON THE OFFER (those
  -- with an inquiry_offer_line_items row for the current offer), mapped to their
  -- participant row via talent_profile_id. This is the SAME set engine_send_offer
  -- seeds approvals for, so a fully-approved offer never shows a false shortfall
  -- and a stale requirement_group.quantity_required can no longer over/under-count.
  offered AS (
    SELECT
      p.requirement_group_id AS group_id,
      p.id                   AS participant_id,
      EXISTS (
        SELECT 1 FROM public.inquiry_approvals a
        WHERE a.participant_id = p.id
          AND a.offer_id       = (SELECT offer_id FROM current_offer)
          AND a.status         = 'accepted'
      )                      AS is_accepted
    FROM public.inquiry_participants p
    WHERE p.inquiry_id = p_inquiry_id
      AND p.role       = 'talent'
      AND p.status     IN ('invited', 'active')
      AND EXISTS (
        SELECT 1 FROM public.inquiry_offer_line_items li
        WHERE li.offer_id          = (SELECT offer_id FROM current_offer)
          AND li.talent_profile_id = p.talent_profile_id
      )
  ),
  per_group AS (
    SELECT
      g.id       AS group_id,
      g.role_key AS role_key,
      COUNT(o.participant_id)::int                              AS offered_count,
      COUNT(o.participant_id) FILTER (WHERE o.is_accepted)::int AS approved_count
    FROM public.inquiry_requirement_groups g
    LEFT JOIN offered o ON o.group_id = g.id
    WHERE g.inquiry_id = p_inquiry_id
    GROUP BY g.id, g.role_key
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'group_id',          group_id,
        'role_key',          role_key,
        'quantity_required', offered_count,
        'offered_count',     offered_count,
        'approved_count',    approved_count,
        'shortfall',         offered_count - approved_count
      )
      ORDER BY role_key
    ) FILTER (WHERE offered_count > approved_count),
    '[]'::jsonb
  )
  FROM per_group;
$function$;

REVOKE ALL     ON FUNCTION public.engine_inquiry_group_shortfall(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_inquiry_group_shortfall(uuid) TO authenticated;

COMMIT;
