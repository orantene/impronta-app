BEGIN;
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT;
INSERT INTO public.client_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.client_profiles cp ON cp.user_id = p.id
WHERE p.app_role = 'client'
  AND cp.user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_client_created
  ON public.inquiries (client_user_id, created_at DESC)
  WHERE client_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_guest_created
  ON public.inquiries (guest_session_id, created_at DESC)
  WHERE guest_session_id IS NOT NULL;
DROP POLICY IF EXISTS settings_public_select_frontend ON public.settings;
CREATE POLICY settings_public_select_frontend ON public.settings
  FOR SELECT
  TO anon, authenticated
  USING (
    key IN (
      'contact_email',
      'directory_public',
      'inquiries_open',
      'watermark_enabled',
      'agency_whatsapp_number'
    )
  );
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

  UPDATE public.inquiries
  SET
    client_user_id = p_client_profile_id,
    updated_at = now()
  WHERE guest_session_id = gid
    AND client_user_id IS NULL;

  DELETE FROM public.saved_talent
  WHERE guest_session_id = gid;
END;
$$;
DROP FUNCTION IF EXISTS public.guest_submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID[]);
CREATE OR REPLACE FUNCTION public.guest_submit_inquiry(
  p_session_key TEXT,
  p_contact_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_company TEXT,
  p_event_type_id UUID,
  p_event_date DATE,
  p_event_location TEXT,
  p_quantity INT,
  p_message TEXT,
  p_raw_ai_query TEXT,
  p_interpreted_query JSONB,
  p_source_page TEXT,
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
    event_type_id,
    event_date,
    event_location,
    quantity,
    message,
    raw_ai_query,
    interpreted_query,
    source_page,
    status
  )
  VALUES (
    gid,
    NULL,
    trim(p_contact_name),
    trim(p_contact_email),
    NULLIF(trim(p_contact_phone), ''),
    NULLIF(trim(p_company), ''),
    p_event_type_id,
    p_event_date,
    NULLIF(trim(COALESCE(p_event_location, '')), ''),
    CASE
      WHEN p_quantity IS NOT NULL AND p_quantity > 0 THEN p_quantity
      ELSE NULL
    END,
    NULLIF(trim(p_message), ''),
    NULLIF(trim(p_raw_ai_query), ''),
    COALESCE(p_interpreted_query, '{}'::jsonb),
    NULLIF(trim(COALESCE(p_source_page, '')), ''),
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
GRANT EXECUTE ON FUNCTION public.guest_submit_inquiry(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  UUID,
  DATE,
  TEXT,
  INT,
  TEXT,
  TEXT,
  JSONB,
  TEXT,
  UUID[]
) TO anon, authenticated;
COMMIT;
