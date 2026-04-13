-- Agency bookings + guest-session RPCs (saves & inquiries without auth)
-- + client inquiry_talent insert policy

BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'booking_status'
  ) THEN
    CREATE TYPE public.booking_status AS ENUM (
      'tentative',
      'confirmed',
      'completed',
      'cancelled'
    );
  END IF;
END
$$;
CREATE TABLE IF NOT EXISTS public.agency_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries (id) ON DELETE CASCADE,
  talent_profile_id UUID REFERENCES public.talent_profiles (id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Booking',
  status public.booking_status NOT NULL DEFAULT 'tentative',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  notes TEXT,
  created_by_staff_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agency_bookings_inquiry
  ON public.agency_bookings (inquiry_id);
ALTER TABLE public.agency_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agency_bookings_staff_all ON public.agency_bookings;
CREATE POLICY agency_bookings_staff_all ON public.agency_bookings
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
DROP POLICY IF EXISTS agency_bookings_client_select ON public.agency_bookings;
CREATE POLICY agency_bookings_client_select ON public.agency_bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.inquiries i
      WHERE i.id = inquiry_id
        AND i.client_user_id = auth.uid()
    )
  );
-- Authenticated clients can attach talent lines to their own draft inquiries
DROP POLICY IF EXISTS inquiry_talent_insert_client ON public.inquiry_talent;
CREATE POLICY inquiry_talent_insert_client ON public.inquiry_talent
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.inquiries i
      WHERE i.id = inquiry_id
        AND i.client_user_id = auth.uid()
    )
  );
-- ---------------------------------------------------------------------------
-- Guest session helpers (SECURITY DEFINER — session key is the capability)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_guest_session(p_session_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
BEGIN
  IF p_session_key IS NULL OR length(trim(p_session_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid session key';
  END IF;

  INSERT INTO public.guest_sessions (session_key)
  VALUES (p_session_key)
  ON CONFLICT (session_key) DO NOTHING;

  SELECT id INTO gid
  FROM public.guest_sessions
  WHERE session_key = p_session_key;

  RETURN gid;
END;
$$;
CREATE OR REPLACE FUNCTION public.guest_add_saved_talent(
  p_session_key TEXT,
  p_talent_profile_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
BEGIN
  SELECT id INTO gid
  FROM public.guest_sessions
  WHERE session_key = p_session_key;

  IF gid IS NULL THEN
    RAISE EXCEPTION 'Unknown guest session';
  END IF;

  INSERT INTO public.saved_talent (guest_session_id, talent_profile_id)
  VALUES (gid, p_talent_profile_id)
  ON CONFLICT (guest_session_id, talent_profile_id) DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.guest_remove_saved_talent(
  p_session_key TEXT,
  p_talent_profile_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
BEGIN
  SELECT id INTO gid
  FROM public.guest_sessions
  WHERE session_key = p_session_key;

  IF gid IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.saved_talent
  WHERE guest_session_id = gid
    AND talent_profile_id = p_talent_profile_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.guest_list_saved_talent_ids(p_session_key TEXT)
RETURNS TABLE (talent_profile_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
BEGIN
  SELECT g.id INTO gid
  FROM public.guest_sessions g
  WHERE g.session_key = p_session_key;

  IF gid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT st.talent_profile_id
  FROM public.saved_talent st
  WHERE st.guest_session_id = gid;
END;
$$;
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

  INSERT INTO public.saved_talent (client_user_id, talent_profile_id)
  SELECT p_client_profile_id, st.talent_profile_id
  FROM public.saved_talent st
  WHERE st.guest_session_id = gid
  ON CONFLICT (client_user_id, talent_profile_id) DO NOTHING;

  DELETE FROM public.saved_talent
  WHERE guest_session_id = gid;
END;
$$;
CREATE OR REPLACE FUNCTION public.guest_submit_inquiry(
  p_session_key TEXT,
  p_contact_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_company TEXT,
  p_message TEXT,
  p_talent_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
  iid UUID;
  tid UUID;
BEGIN
  IF p_contact_name IS NULL OR length(trim(p_contact_name)) = 0 THEN
    RAISE EXCEPTION 'Name required';
  END IF;
  IF p_contact_email IS NULL OR length(trim(p_contact_email)) = 0 THEN
    RAISE EXCEPTION 'Email required';
  END IF;

  SELECT id INTO gid
  FROM public.guest_sessions
  WHERE session_key = p_session_key;

  IF gid IS NULL THEN
    RAISE EXCEPTION 'Unknown guest session';
  END IF;

  IF p_talent_ids IS NULL OR array_length(p_talent_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one talent';
  END IF;

  INSERT INTO public.inquiries (
    guest_session_id,
    client_user_id,
    contact_name,
    contact_email,
    contact_phone,
    company,
    message,
    status
  )
  VALUES (
    gid,
    NULL,
    trim(p_contact_name),
    trim(p_contact_email),
    NULLIF(trim(p_contact_phone), ''),
    NULLIF(trim(p_company), ''),
    NULLIF(trim(p_message), ''),
    'new'::public.inquiry_status
  )
  RETURNING id INTO iid;

  FOREACH tid IN ARRAY p_talent_ids
  LOOP
    INSERT INTO public.inquiry_talent (inquiry_id, talent_profile_id)
    VALUES (iid, tid)
    ON CONFLICT (inquiry_id, talent_profile_id) DO NOTHING;
  END LOOP;

  RETURN iid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_guest_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_add_saved_talent(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_remove_saved_talent(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_list_saved_talent_ids(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_guest_session_to_client(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID[]) TO anon, authenticated;
COMMIT;
