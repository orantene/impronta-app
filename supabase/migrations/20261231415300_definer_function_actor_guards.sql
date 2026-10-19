-- PR 0b-4: signed-in users cannot rewrite other people's data through database
-- functions. HELD FILE (supabase/migrations/_pending_pm/): NOT applied by the
-- author. PM moves it to supabase/migrations/ and runs db:push at merge.
--
-- Four SECURITY DEFINER functions were executable by `authenticated` and never
-- read auth.uid() (confirmed on staging fxlank 2026-10-18 by ACL + body scan, and
-- by a rolled-back transaction as a signed-in user with no seat anywhere):
--
--   replace_talent_languages     wiped + rewrote any talent's languages
--   engine_send_offer            sent any inquiry's draft offer as any actor
--   engine_submit_approval       accepted/rejected for any participant
--   engine_emit_system_event     forged system timeline events on any inquiry
--
-- Fix, forward-only and idempotent (CREATE OR REPLACE + REVOKE/GRANT):
--  * replace_talent_languages: re-apply the guard that 20260904151422 added and
--    the two later body rewrites dropped; staff must also have the talent on the
--    tenant roster.
--  * engine_send_offer / engine_submit_approval: p_actor_user_id must equal
--    auth.uid(); caller must be staff of the inquiry tenant / the seat owner.
--    submit_approval also now checks the participant and offer belong to the
--    inquiry. Bodies are otherwise byte-identical to the deployed definitions
--    (20261231236000 for send, 20260527000002 for approval).
--  * engine_emit_system_event: REVOKE from authenticated. Its only callers are
--    the cron sweeps, which use the service-role client (verified by grep:
--    api/cron/inquiry-engine -> createServiceRoleClient, api/cron/flag-unassigned
--    -> admin).
-- Service-role callers (auth.uid() NULL, role service_role) keep working: the
-- talent self-edit, guest-client and talent-quote paths run on the service role.
-- A session with no JWT at all (psql, migrations, replay tests) is also admitted.
--
-- NOT fixed here (bucket 2 read-only DEFINER leaks, 20261124000000 ~L244-252):
-- engine_load_commission_context, engine_persist_booking_commission_snapshot,
-- engine_workspace_base_fee_inputs, engine_inquiry_group_shortfall,
-- acceptance_summary_for_offer, lineup_status_summary,
-- owning_parties_for_inquiry, is_cross_tenant_inquiry,
-- reconcile_expired_plan_overrides.

BEGIN;

CREATE OR REPLACE FUNCTION public.replace_talent_languages(p_talent_profile_id uuid, p_tenant_id uuid, p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- ACTOR GUARD (PR 0b-4). Re-applies the guard 20260904151422 added and
  -- 20260910213137 / 20260912000000 silently dropped when they replaced the body.
  -- service_role (our own server; the talent self-edit path runs on it and the
  -- app layer has already authorised) and DB-internal sessions with no JWT at all
  -- are admitted. Any signed-in caller must be the talent who owns the profile,
  -- staff of p_tenant_id WITH the talent on that tenant's roster, or a platform
  -- admin. The roster test closes the cross-tenant case: staff of tenant A could
  -- otherwise pass their own tenant id and another tenant's talent id.
  IF auth.role() = 'service_role'
     OR (auth.uid() IS NULL AND coalesce(auth.role(), '') = '') THEN
    NULL;
  ELSIF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'replace_talent_languages: not authenticated' USING ERRCODE = '42501';
  ELSIF NOT (
    public.is_platform_admin()
    OR public.is_talent_profile_owner(p_talent_profile_id)
    OR (
      public.is_staff_of_tenant(p_tenant_id)
      AND EXISTS (
        SELECT 1 FROM public.agency_talent_roster r
        WHERE r.tenant_id = p_tenant_id
          AND r.talent_profile_id = p_talent_profile_id
          AND r.status <> 'removed'
      )
    )
  ) THEN
    RAISE EXCEPTION 'replace_talent_languages: not authorized for this talent or tenant'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.talent_languages
    WHERE talent_profile_id = p_talent_profile_id;

  IF jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO public.talent_languages (
      talent_profile_id,
      tenant_id,
      language_code,
      language_name,
      speaking_level,
      is_native,
      can_host,
      can_sell,
      can_translate,
      can_teach,
      display_order
    )
    SELECT
      p_talent_profile_id,
      p_tenant_id,
      (r->>'language_code'),
      (r->>'language_name'),
      (r->>'speaking_level')::text,
      COALESCE((r->>'is_native')::boolean, false),
      COALESCE((r->>'can_host')::boolean,  false),
      COALESCE((r->>'can_sell')::boolean,  false),
      COALESCE((r->>'can_translate')::boolean, false),
      COALESCE((r->>'can_teach')::boolean, false),
      COALESCE((r->>'display_order')::int, 0)
    FROM jsonb_array_elements(p_rows) AS r;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engine_send_offer(p_inquiry_id uuid, p_offer_id uuid, p_actor_user_id uuid, p_inquiry_expected_version integer, p_offer_expected_version integer)
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
  v_uid                 UUID;
  v_trusted             BOOLEAN;
BEGIN
  -- Lock inquiry row.
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- ACTOR GUARD (PR 0b-4). service_role (our server, app layer already
  -- authorised) and DB-internal sessions with no JWT are admitted. A signed-in
  -- caller must BE the actor they claim, and must hold a seat on this inquiry.
  v_uid := auth.uid();
  v_trusted := (auth.role() = 'service_role')
               OR (v_uid IS NULL AND coalesce(auth.role(), '') = '');
  IF NOT v_trusted THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_actor_user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'actor_mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NOT v_trusted AND NOT (
    public.is_staff_of_tenant(inq.tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants cp
      WHERE cp.inquiry_id = p_inquiry_id
        AND cp.user_id    = v_uid
        AND cp.role       = 'coordinator'
        AND cp.status     = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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

CREATE OR REPLACE FUNCTION public.engine_submit_approval(p_inquiry_id uuid, p_offer_id uuid, p_participant_id uuid, p_actor_user_id uuid, p_inquiry_expected_version integer, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inq          RECORD;
  all_accepted BOOLEAN;
  already      BOOLEAN := FALSE;
  v_actor_role public.inquiry_event_actor_role := 'client';
  v_uid        UUID;
  v_trusted    BOOLEAN;
  v_part       RECORD;
BEGIN
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  -- ACTOR GUARD (PR 0b-4). service_role (our server, app layer already
  -- authorised) and DB-internal sessions with no JWT are admitted. A signed-in
  -- caller must BE the actor they claim, and must hold a seat on this inquiry.
  v_uid := auth.uid();
  v_trusted := (auth.role() = 'service_role')
               OR (v_uid IS NULL AND coalesce(auth.role(), '') = '');
  IF NOT v_trusted THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_actor_user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'actor_mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- The seat and the offer must belong to THIS inquiry (previously unchecked: a
  -- participant or offer id from another inquiry could be written against it).
  SELECT ip.* INTO v_part
    FROM public.inquiry_participants ip
    WHERE ip.id = p_participant_id AND ip.inquiry_id = p_inquiry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'participant_not_found' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inquiry_offers o
    WHERE o.id = p_offer_id AND o.inquiry_id = p_inquiry_id
  ) THEN
    RAISE EXCEPTION 'offer_not_found';
  END IF;

  -- A signed-in caller decides only for their OWN seat (the client seat user, or
  -- the owner of the talent profile on the seat), or as staff of the inquiry's
  -- tenant / the seat's owning agency (cross-tenant inquiries), or platform admin.
  IF NOT v_trusted AND NOT (
    v_part.user_id = v_uid
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = v_part.talent_profile_id AND tp.user_id = v_uid
    )
    OR public.is_staff_of_tenant(inq.tenant_id)
    OR (
      v_part.owning_party_type IN ('agency', 'workspace')
      AND v_part.owning_party_id IS NOT NULL
      AND public.is_staff_of_tenant(v_part.owning_party_id)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
$function$;

-- CREATE OR REPLACE keeps existing ACLs, but re-state them: never PUBLIC/anon.
REVOKE ALL ON FUNCTION public.replace_talent_languages(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_talent_languages(uuid, uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.engine_send_offer(uuid, uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engine_send_offer(uuid, uuid, uuid, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.engine_submit_approval(uuid, uuid, uuid, uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engine_submit_approval(uuid, uuid, uuid, uuid, integer, text, text) TO authenticated, service_role;

-- engine_emit_system_event: service role / DB-internal only.
REVOKE ALL ON FUNCTION public.engine_emit_system_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.engine_emit_system_event(uuid, text, jsonb) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.engine_emit_system_event(uuid, text, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.engine_emit_system_event(uuid, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'engine_emit_system_event is still executable by a client role';
  END IF;
  IF has_function_privilege('anon', 'public.replace_talent_languages(uuid, uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.engine_send_offer(uuid, uuid, uuid, integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.engine_submit_approval(uuid, uuid, uuid, uuid, integer, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a guarded engine function is anon-executable';
  END IF;
END $$;

COMMIT;
