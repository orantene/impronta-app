-- B4 — Secure guest→account claim (Lane A, security-critical).
--
-- ┌─ THE PROBLEM THIS FIXES ─────────────────────────────────────────────────┐
-- │ The LIVE merge_guest_session_to_client(p_session_key, p_client_profile_id) │
-- │ (migration 20260408110100) relinks inquiries on COOKIE ALONE:              │
-- │     UPDATE inquiries SET client_user_id = p_client_profile_id              │
-- │     WHERE guest_session_id = gid AND client_user_id IS NULL;               │
-- │ On a SHARED DEVICE this hands one person's in-flight conversations to      │
-- │ whoever next signs in — a real account-takeover-of-content hole.          │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- FIX (two parts):
--   1. Redefine the 2-arg RPC to relink ONLY saved_talent (low-risk favorites).
--      It NO LONGER relinks inquiries — closing the cookie-alone inquiry hole.
--      Both existing callers keep working; they simply stop silently claiming
--      inquiries on cookie.
--   2. Add a NEW 3-arg overload that ALSO relinks inquiries, but EMAIL-GATED:
--      only inquiries whose contact_email matches the caller's proven email are
--      relinked. This is the claim path the guest-chat contract specifies.
--
-- WHY EMAIL-GATING IS THE SHARED-DEVICE DEFENSE:
--   The relink requires lower(inquiries.contact_email) = lower(p_verified_email)
--   AND client_user_id IS NULL. The application passes the AUTHENTICATED
--   account's own email. A different person signing in (different account email)
--   therefore cannot match, and never inherits the original guest's inquiries.
--   This is strictly stronger than cookie-alone and is the guard the deep-dive
--   (conversational-inquiry-deep-dives-2026-06-03.md, Part A Gap 3) requires:
--   "never merge on cookie alone; scope to this session AND the verified email."
--
--   SECURITY INVARIANT (read carefully — the earlier rationale was WRONG):
--   Under supabase/config.toml enable_confirmations=false, signup AUTO-confirms,
--   so the account email is NOT proof of inbox control — auto-confirm makes the
--   account email LESS trustworthy, not more. The relink is safe TODAY for a
--   different reason: the ONLY claimable rows are client_user_id IS NULL, and
--   every guest inquiry-creation path provisions a confirmed account for the
--   contact_email (ensureGuestClientByEmail sets client_user_id NON-NULL) UNLESS
--   the email is a privileged (staff/talent) account already registered — so a
--   claimable NULL-client inquiry only ever has a contact_email that already owns
--   an account an attacker can't register. That joint invariant (NOT the account
--   email being "verified") is what closes the hole.
--
--   CALLERS: pass p_verified_email ONLY when the account email is actually
--   confirmed. mergeGuestActivity reads auth email_confirmed_at (service-role)
--   and passes '' when unconfirmed, so the relink falls through to the
--   favorites-only path — future-proofing for when confirmations get enabled.
--   Do NOT pass a guest-typed, unverified email as p_verified_email.
--
-- The existing `IF p_client_profile_id IS DISTINCT FROM auth.uid()` guard is
-- preserved on BOTH variants (a caller can only merge into THEIR OWN account).

BEGIN;

-- ── 1. Harden the 2-arg variant: saved_talent only, NO inquiry relink. ──────
CREATE OR REPLACE FUNCTION public.merge_guest_session_to_client(
  p_session_key TEXT,
  p_client_profile_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
BEGIN
  IF p_client_profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT id INTO gid
  FROM public.guest_sessions
  WHERE session_key = p_session_key;

  IF gid IS NULL THEN
    RETURN;
  END IF;

  -- Favorites / inquiry-cart rows are low-risk: cookie possession is enough.
  INSERT INTO public.saved_talent (client_user_id, talent_profile_id)
  SELECT p_client_profile_id, st.talent_profile_id
  FROM public.saved_talent st
  WHERE st.guest_session_id = gid
  ON CONFLICT (client_user_id, talent_profile_id) DO NOTHING;

  DELETE FROM public.saved_talent
  WHERE guest_session_id = gid;

  -- Inquiries are no longer relinked here. Conversation content requires the
  -- email-gated 3-arg overload below. (Cookie-alone inquiry claim removed.)
END;
$$;

-- ── 2. New 3-arg overload: saved_talent + EMAIL-GATED inquiry relink. ───────
CREATE OR REPLACE FUNCTION public.merge_guest_session_to_client(
  p_session_key TEXT,
  p_client_profile_id UUID,
  p_verified_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
  norm_email TEXT;
BEGIN
  IF p_client_profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  norm_email := lower(trim(COALESCE(p_verified_email, '')));
  IF length(norm_email) = 0 THEN
    -- No proven email ⇒ refuse to relink inquiries; behave like the 2-arg
    -- (favorites-only) path so the caller can't accidentally claim content.
    PERFORM public.merge_guest_session_to_client(p_session_key, p_client_profile_id);
    RETURN;
  END IF;

  SELECT id INTO gid
  FROM public.guest_sessions
  WHERE session_key = p_session_key;

  IF gid IS NULL THEN
    RETURN;
  END IF;

  -- Favorites: cookie is enough.
  INSERT INTO public.saved_talent (client_user_id, talent_profile_id)
  SELECT p_client_profile_id, st.talent_profile_id
  FROM public.saved_talent st
  WHERE st.guest_session_id = gid
  ON CONFLICT (client_user_id, talent_profile_id) DO NOTHING;

  DELETE FROM public.saved_talent
  WHERE guest_session_id = gid;

  -- Inquiries: cookie (guest_session_id) AND a matching verified email. Both
  -- must hold; this is the shared-device defense.
  UPDATE public.inquiries
  SET
    client_user_id = p_client_profile_id,
    updated_at = now()
  WHERE guest_session_id = gid
    AND client_user_id IS NULL
    AND lower(trim(contact_email)) = norm_email;

  -- inquiry_messages.guest_session_id authorship is intentionally NOT rewritten:
  -- historical guest sends stay attributed to the guest session; only NEW sends
  -- (post-claim, via the authenticated user path) carry sender_user_id.
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_guest_session_to_client(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_guest_session_to_client(TEXT, UUID, TEXT) TO authenticated;

COMMIT;
