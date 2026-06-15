-- Guest→registered claim hardening (Lane A: CONV-F1 + CONV-F4).
--
-- The 3-arg merge_guest_session_to_client relinks inquiries.client_user_id but
-- (1) leaves inquiries.guest_session_id set — the originating browser keeps
--     cookie-based read/write (validateActorPermission / loadOwnedInquiry gate
--     on inquiries.guest_session_id == cookie) for the guest_sessions lifetime;
-- (2) leaves the guest's pre-claim inquiry_messages with sender_user_id NULL —
--     so they render as left-aligned "System" once the buyer registers.
--
-- This redefines ONLY the 3-arg overload. For each inquiry it actually relinks
-- (same cookie + email-matched + client_user_id IS NULL filter — UNCHANGED), it
-- ALSO, in the same statement scope:
--   (a) backfills sender_user_id = p_client_profile_id on that inquiry's
--       guest-authored rows (sender_user_id IS NULL AND guest_session_id = gid),
--       so they attribute to the now-registered client everywhere; then
--   (b) clears inquiries.guest_session_id on the relinked rows, severing the
--       old cookie's access.
-- Scope is the single claimed inquiry only — an unrelated in-flight guest on the
-- same session (different contact_email) keeps their guest_session_id and is not
-- orphaned (verified present in live data: one guest_session spans 2 inquiries
-- with 2 distinct emails; the email filter handles it correctly).
-- The 2-arg (favorites-only) variant is unchanged.

BEGIN;

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

  -- (a) Re-attribute the guest's pre-claim messages to the registered client,
  --     but ONLY on the inquiries we are about to relink (cookie + email match +
  --     still unclaimed). MUST run BEFORE (b): the subquery filter is evaluated
  --     before (b) nulls guest_session_id on the inquiry rows.
  UPDATE public.inquiry_messages m
  SET sender_user_id = p_client_profile_id
  WHERE m.guest_session_id = gid
    AND m.sender_user_id IS NULL
    AND m.inquiry_id IN (
      SELECT id FROM public.inquiries
      WHERE guest_session_id = gid
        AND client_user_id IS NULL
        AND lower(trim(contact_email)) = norm_email
    );

  -- (b) Relink the inquiry AND sever the old cookie by clearing guest_session_id.
  --     Same WHERE filter as before, plus the guest_session_id reset.
  UPDATE public.inquiries
  SET
    client_user_id = p_client_profile_id,
    guest_session_id = NULL,
    updated_at = now()
  WHERE guest_session_id = gid
    AND client_user_id IS NULL
    AND lower(trim(contact_email)) = norm_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_guest_session_to_client(TEXT, UUID, TEXT) TO authenticated;

COMMIT;
