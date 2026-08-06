-- Fix: `IF v_roster IS NOT NULL` never fired, so claiming never recorded consent.
--
-- In PL/pgSQL, `record IS NOT NULL` is true only when EVERY field of the record
-- is non-null (and `record IS NULL` only when every field IS null). It is NOT a
-- "did the SELECT find a row" test. `agency_talent_roster` has many nullable
-- columns (removed_at, removed_by, exclusivity_declined_at,
-- archived_for_downgrade_*), so a perfectly good row always failed the guard —
-- the exclusivity/consent block was dead code.
--
-- Caught by end-to-end verification: with the is_primary backfill live and
-- Veleria's Impronta row at is_primary=TRUE, claim_talent_profile still returned
-- exclusive_confirmed=false. Unit-level SQL would not have shown this.
--
-- Correct idiom: test a NOT NULL column (the primary key), or use FOUND
-- immediately after the SELECT. We use `v_roster.id IS NOT NULL` because other
-- statements run between the SELECT and the check.
--
-- The two earlier record guards in this function are unaffected: `v_inv IS NULL`
-- and `v_profile IS NULL` are true exactly when the SELECT found nothing (all
-- fields null), which is the behaviour they want.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_talent_profile(
  p_invitation_id uuid,
  p_email         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid := auth.uid();
  v_inv       record;
  v_profile   record;
  v_existing  uuid;
  v_roster    record;
  v_plan      text;
  v_exclusive boolean := false;
  v_email_ok  boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv FROM public.talent_claim_invitations WHERE id = p_invitation_id;
  IF v_inv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_revoked');
  END IF;
  IF v_inv.redeemed_at IS NOT NULL THEN
    IF v_inv.redeemed_by_user_id = uid THEN
      RETURN jsonb_build_object('ok', true, 'reason', 'already_redeemed_by_you',
        'talent_profile_id', v_inv.talent_profile_id, 'tenant_id', v_inv.tenant_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_already_redeemed');
  END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_expired');
  END IF;

  IF v_inv.invited_email IS NOT NULL THEN
    v_email_ok := lower(trim(coalesce(p_email, ''))) = lower(trim(v_inv.invited_email));
    IF NOT v_email_ok THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
    END IF;
  END IF;

  SELECT * INTO v_profile FROM public.talent_profiles WHERE id = v_inv.talent_profile_id;
  IF v_profile IS NULL OR v_profile.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_unavailable');
  END IF;

  IF v_profile.user_id = uid THEN
    UPDATE public.talent_claim_invitations
       SET redeemed_at = now(), redeemed_by_user_id = uid
     WHERE id = p_invitation_id;
    RETURN jsonb_build_object('ok', true, 'reason', 'already_yours',
      'talent_profile_id', v_profile.id, 'tenant_id', v_inv.tenant_id);
  END IF;

  IF v_profile.user_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_already_claimed');
  END IF;

  SELECT id INTO v_existing
  FROM public.talent_profiles
  WHERE user_id = uid AND deleted_at IS NULL
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claimer_has_profile',
      'existing_profile_id', v_existing);
  END IF;

  UPDATE public.talent_profiles
     SET user_id = uid, claimed_at = now(), invitation_email = NULL
   WHERE id = v_profile.id;

  UPDATE public.talent_claim_invitations
     SET redeemed_at = now(), redeemed_by_user_id = uid
   WHERE id = p_invitation_id;

  SELECT * INTO v_roster
  FROM public.agency_talent_roster
  WHERE tenant_id = v_inv.tenant_id
    AND talent_profile_id = v_profile.id
    AND removed_at IS NULL
  LIMIT 1;

  SELECT plan_tier INTO v_plan FROM public.agencies WHERE id = v_inv.tenant_id;

  -- THE FIX: `v_roster.id IS NOT NULL`, not `v_roster IS NOT NULL`.
  -- Consent-only: we timestamp agreement and never write is_primary, so
  -- clicking a link cannot mint exclusivity the agency did not already hold.
  IF v_roster.id IS NOT NULL
     AND coalesce(v_plan, '') IN ('studio', 'agency', 'network', 'hub-network')
  THEN
    IF v_roster.exclusivity_status = 'auto_assigned' THEN
      UPDATE public.agency_talent_roster
         SET exclusivity_status = 'confirmed', exclusivity_confirmed_at = now()
       WHERE id = v_roster.id;
    ELSIF v_roster.exclusivity_confirmed_at IS NULL THEN
      UPDATE public.agency_talent_roster
         SET exclusivity_confirmed_at = now()
       WHERE id = v_roster.id;
    END IF;
    v_exclusive := coalesce(v_roster.is_primary, false);
  END IF;

  INSERT INTO public.talent_workflow_events (talent_profile_id, tenant_id, event_type, payload, actor_user_id)
  VALUES (v_profile.id, v_inv.tenant_id, 'claim.accepted',
          jsonb_build_object('invitation_id', p_invitation_id, 'exclusive_confirmed', v_exclusive), uid);

  RETURN jsonb_build_object(
    'ok', true, 'reason', 'claimed',
    'talent_profile_id', v_profile.id,
    'tenant_id', v_inv.tenant_id,
    'exclusive_confirmed', v_exclusive,
    'plan_tier', v_plan);
END;
$$;

COMMIT;
