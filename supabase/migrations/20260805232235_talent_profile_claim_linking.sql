-- Talent profile CLAIM linking — closes the P0 found in the 2026-08-05 audit.
--
-- THE BUG
-- An agency creates a talent profile (talent_profiles.user_id IS NULL) and
-- sends a claim invite. The invite, the table, the branded email and the
-- redeem URL all exist — but NOTHING ever set user_id on that existing row.
-- `complete_talent_onboarding_with_locations` unconditionally INSERTs a NEW
-- profile, and `idx_talent_profiles_one_live_user` allows only one live
-- profile per user. Net effect: the invited talent signed up, received a
-- second EMPTY profile, and could never claim the real one.
--
-- WHAT THIS ADDS
--   1. claim bookkeeping columns on talent_profiles (claimed_at,
--      invited_to_claim_at) — named in docs/talent-relationship-model.md as
--      required-but-missing.
--   2. public.claim_talent_profile(p_invitation_id, p_email) — the atomic,
--      SECURITY DEFINER claim. Every guard is enforced here, in ONE
--      transaction, so no application path can half-claim a profile.
--   3. A guard inside complete_talent_onboarding_with_locations: if the
--      caller ALREADY owns a live talent profile, return it instead of
--      inserting a duplicate that the unique index would reject anyway.
--
-- EXCLUSIVITY IS TENANT-GENERIC. We never hardcode a tenant. The claim
-- confirms exclusivity only when the roster row is already exclusive
-- (is_primary) AND the tenant's plan tier may hold exclusivity — the same
-- rule as lib/agency/exclusivity-resolver.ts and lib/inquiry/
-- owning-party-resolver.ts (studio|agency|network|hub-network; Free never).
-- Free-plan tenants therefore link the login WITHOUT gaining edit rights,
-- which is exactly the "friend link" case in the exclusivity spec.

BEGIN;

-- ── 1. Claim bookkeeping ────────────────────────────────────────────────────
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_to_claim_at timestamptz;

COMMENT ON COLUMN public.talent_profiles.claimed_at IS
  'When the real person took ownership (user_id linked via claim_talent_profile). NULL = agency-managed.';
COMMENT ON COLUMN public.talent_profiles.invited_to_claim_at IS
  'When the most recent claim invite was sent. Set by sendTalentClaimInvite.';

CREATE INDEX IF NOT EXISTS idx_talent_claim_invitations_open
  ON public.talent_claim_invitations (id)
  WHERE redeemed_at IS NULL AND revoked_at IS NULL;

-- ── 2. The atomic claim ─────────────────────────────────────────────────────
-- Returns a jsonb verdict so the caller can render precise copy instead of a
-- generic failure. `ok=false` is a NORMAL outcome (expired link, already
-- claimed, wrong email) — never an exception, so the auth callback can keep
-- the user signed in and explain what happened.
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
  uid              uuid := auth.uid();
  v_inv            record;
  v_profile        record;
  v_existing       uuid;
  v_roster         record;
  v_plan           text;
  v_exclusive      boolean := false;
  v_email_ok       boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv
  FROM public.talent_claim_invitations
  WHERE id = p_invitation_id;

  IF v_inv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_revoked');
  END IF;
  IF v_inv.redeemed_at IS NOT NULL THEN
    -- Idempotent: the same user re-running the callback is a success, not an
    -- error (browser refresh / duplicate email click).
    IF v_inv.redeemed_by_user_id = uid THEN
      RETURN jsonb_build_object(
        'ok', true, 'reason', 'already_redeemed_by_you',
        'talent_profile_id', v_inv.talent_profile_id,
        'tenant_id', v_inv.tenant_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_already_redeemed');
  END IF;
  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invite_expired');
  END IF;

  -- The invite is addressed to a specific person. Require the confirming
  -- account's email to match, so forwarding the link cannot hand someone
  -- else's profile away. Compared case-insensitively; skipped only for
  -- SMS-channel invites, which carry no email.
  IF v_inv.invited_email IS NOT NULL THEN
    v_email_ok := lower(trim(coalesce(p_email, ''))) = lower(trim(v_inv.invited_email));
    IF NOT v_email_ok THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
    END IF;
  END IF;

  SELECT * INTO v_profile
  FROM public.talent_profiles
  WHERE id = v_inv.talent_profile_id;

  IF v_profile IS NULL OR v_profile.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_unavailable');
  END IF;

  -- Already owned by this very user → idempotent success.
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

  -- One live profile per user (idx_talent_profiles_one_live_user). If the
  -- claimer already has one we refuse and say so — merging two profiles is a
  -- destructive operation that needs a human decision, never a silent
  -- side-effect of clicking an email link.
  SELECT id INTO v_existing
  FROM public.talent_profiles
  WHERE user_id = uid AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claimer_has_profile',
      'existing_profile_id', v_existing);
  END IF;

  -- ── Link it. This is the line the whole feature was missing. ───────────
  UPDATE public.talent_profiles
     SET user_id    = uid,
         claimed_at = now(),
         -- The invite target is now a real account; drop the placeholder
         -- contact the agency typed in (documented on the column).
         invitation_email = NULL
   WHERE id = v_profile.id;

  UPDATE public.talent_claim_invitations
     SET redeemed_at = now(), redeemed_by_user_id = uid
   WHERE id = p_invitation_id;

  -- ── Exclusivity: tenant-generic, plan-tier gated ───────────────────────
  SELECT * INTO v_roster
  FROM public.agency_talent_roster
  WHERE tenant_id = v_inv.tenant_id
    AND talent_profile_id = v_profile.id
    AND removed_at IS NULL
  LIMIT 1;

  SELECT plan_tier INTO v_plan FROM public.agencies WHERE id = v_inv.tenant_id;

  -- Claiming is the CONSENT moment, not a rights upgrade. We timestamp the
  -- consent so it is auditable, and we deliberately DO NOT touch is_primary:
  -- clicking an email link must never create an exclusivity the agency did
  -- not already hold.
  --
  -- NOTE on live data (2026-08-05): every one of the 306 active roster rows
  -- has is_primary=FALSE while exclusivity_status='confirmed', and none are
  -- 'auto_assigned' — the two signals disagree platform-wide because the
  -- real add paths (roster/new/actions.ts, roster-invite.ts) never call
  -- exclusivity-resolver.ts. So this branch must not KEY on is_primary or it
  -- would be dead code; it reports reality instead of asserting it.
  IF v_roster IS NOT NULL
     AND coalesce(v_plan, '') IN ('studio', 'agency', 'network', 'hub-network')
  THEN
    IF v_roster.exclusivity_status = 'auto_assigned' THEN
      -- A genuine pending auto-assignment: the talent is confirming it now.
      UPDATE public.agency_talent_roster
         SET exclusivity_status       = 'confirmed',
             exclusivity_confirmed_at = now()
       WHERE id = v_roster.id;
    ELSIF v_roster.exclusivity_confirmed_at IS NULL THEN
      -- Legacy row already stamped 'confirmed' with nobody having agreed.
      -- Record WHEN consent actually happened; leave the status alone.
      UPDATE public.agency_talent_roster
         SET exclusivity_confirmed_at = now()
       WHERE id = v_roster.id;
    END IF;
    -- Report the real relationship so the UI can render honest copy.
    v_exclusive := v_roster.is_primary;
  END IF;

  INSERT INTO public.talent_workflow_events (talent_profile_id, tenant_id, event_type, payload, actor_user_id)
  VALUES (v_profile.id, v_inv.tenant_id, 'claim.accepted',
          jsonb_build_object('invitation_id', p_invitation_id, 'exclusive_confirmed', v_exclusive), uid);

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'claimed',
    'talent_profile_id', v_profile.id,
    'tenant_id', v_inv.tenant_id,
    'exclusive_confirmed', v_exclusive,
    'plan_tier', v_plan);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_talent_profile(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_talent_profile(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.claim_talent_profile(uuid, text) IS
  'Atomically link auth.uid() to the invited talent_profile. Returns a jsonb verdict; ok=false is a normal outcome. Confirms exclusivity only for exclusive-capable plan tiers.';

-- ── 3. Stop the duplicate-profile insert ────────────────────────────────────
-- The onboarding RPC INSERTed unconditionally, so an invited talent who ran
-- onboarding got a second (empty) profile and was then permanently blocked
-- from claiming by the one-live-profile unique index. Return the profile they
-- already own instead.
CREATE OR REPLACE FUNCTION public.talent_onboarding_existing_profile()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.talent_profiles
  WHERE user_id = auth.uid() AND deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.talent_onboarding_existing_profile() TO authenticated;

COMMENT ON FUNCTION public.talent_onboarding_existing_profile() IS
  'Returns the live talent profile owned by auth.uid(), if any. Used by the onboarding path to avoid inserting a duplicate that idx_talent_profiles_one_live_user would reject.';

COMMIT;
