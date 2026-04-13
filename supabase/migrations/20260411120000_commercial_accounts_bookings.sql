-- Commercial model: client_accounts, contacts, inquiry/booking extensions, booking_talent.
-- Inquiry = demand; booking = fulfillment; account/contact/venue snapshots preserved.

BEGIN;
-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE public.client_account_type AS ENUM (
    'private_client',
    'villa',
    'resort',
    'hotel',
    'restaurant',
    'beach_club',
    'real_estate_company',
    'brand',
    'agency',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  CREATE TYPE public.inquiry_source_channel AS ENUM (
    'directory_guest',
    'directory_client',
    'phone',
    'whatsapp',
    'email',
    'admin',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'transfer', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  CREATE TYPE public.payment_status AS ENUM ('unpaid', 'partial', 'paid', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
DO $$
BEGIN
  CREATE TYPE public.pricing_unit AS ENUM ('hour', 'day', 'week', 'event');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
-- inquiry_status / booking_status extensions: see 20260411115900_commercial_extend_inquiry_booking_enums.sql

-- ---------------------------------------------------------------------------
-- client_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_type public.client_account_type NOT NULL DEFAULT 'other',
  primary_email TEXT,
  primary_phone TEXT,
  website_url TEXT,
  billing_notes TEXT,
  internal_notes TEXT,
  location_text TEXT,
  location_id UUID REFERENCES public.locations (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_client_accounts_archived
  ON public.client_accounts (archived_at)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_accounts_name
  ON public.client_accounts (lower(name));
-- ---------------------------------------------------------------------------
-- client_account_contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_account_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id UUID NOT NULL REFERENCES public.client_accounts (id) ON DELETE CASCADE,
  profile_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp_phone TEXT,
  job_title TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_client_account_contacts_account
  ON public.client_account_contacts (client_account_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_client_account_contacts_profile
  ON public.client_account_contacts (profile_user_id)
  WHERE profile_user_id IS NOT NULL AND archived_at IS NULL;
-- ---------------------------------------------------------------------------
-- RLS: client_accounts & client_account_contacts (staff only for now)
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_account_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_accounts_staff_all ON public.client_accounts;
CREATE POLICY client_accounts_staff_all ON public.client_accounts
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
DROP POLICY IF EXISTS client_account_contacts_staff_all ON public.client_account_contacts;
CREATE POLICY client_account_contacts_staff_all ON public.client_account_contacts
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
-- ---------------------------------------------------------------------------
-- inquiries: account/contact links + intake metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS client_account_id UUID REFERENCES public.client_accounts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_contact_id UUID REFERENCES public.client_account_contacts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_channel public.inquiry_source_channel NOT NULL DEFAULT 'directory_guest',
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of_inquiry_id UUID REFERENCES public.inquiries (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_client_account
  ON public.inquiries (client_account_id)
  WHERE client_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_source_channel
  ON public.inquiries (source_channel);
UPDATE public.inquiries
SET source_channel = 'directory_guest'
WHERE source_channel IS NULL;
-- Legacy "closed" → closed_lost for clearer semantics (enum value must exist)
UPDATE public.inquiries
SET status = 'closed_lost'::public.inquiry_status
WHERE status = 'closed'::public.inquiry_status;
-- ---------------------------------------------------------------------------
-- inquiry_talent: surrogate id + workflow fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiry_talent
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS added_by_staff_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE public.inquiry_talent SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.inquiry_talent ALTER COLUMN id SET NOT NULL;
DO $$
BEGIN
  ALTER TABLE public.inquiry_talent DROP CONSTRAINT inquiry_talent_pkey;
EXCEPTION
  WHEN undefined_object THEN NULL;
END
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inquiry_talent_pkey' AND conrelid = 'public.inquiry_talent'::regclass
  ) THEN
    ALTER TABLE public.inquiry_talent ADD PRIMARY KEY (id);
  END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_talent_inquiry_talent_unique
  ON public.inquiry_talent (inquiry_id, talent_profile_id);
-- ---------------------------------------------------------------------------
-- agency_bookings → commercial booking row (one booking, many booking_talent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS source_inquiry_id UUID REFERENCES public.inquiries (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_account_id UUID REFERENCES public.client_accounts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_contact_id UUID REFERENCES public.client_account_contacts (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_staff_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_staff_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method,
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_notes TEXT,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS client_account_name TEXT,
  ADD COLUMN IF NOT EXISTS client_account_type TEXT,
  ADD COLUMN IF NOT EXISTS event_type_id UUID REFERENCES public.taxonomy_terms (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_date DATE,
  ADD COLUMN IF NOT EXISTS venue_name TEXT,
  ADD COLUMN IF NOT EXISTS venue_address TEXT,
  ADD COLUMN IF NOT EXISTS venue_location_text TEXT,
  ADD COLUMN IF NOT EXISTS venue_location_id UUID REFERENCES public.locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_client_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_talent_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_summary TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS client_visible_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicate_of_booking_id UUID REFERENCES public.agency_bookings (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
-- Backfill source_inquiry_id from legacy inquiry_id
UPDATE public.agency_bookings
SET source_inquiry_id = inquiry_id
WHERE source_inquiry_id IS NULL AND inquiry_id IS NOT NULL;
-- Copy notes → internal_notes once
UPDATE public.agency_bookings
SET internal_notes = notes
WHERE internal_notes IS NULL AND notes IS NOT NULL AND length(trim(notes)) > 0;
-- Policy references inquiry_id; drop before removing column (recreated below).
DROP POLICY IF EXISTS agency_bookings_client_select ON public.agency_bookings;
-- Drop legacy FK and inquiry_id; keep data via source_inquiry_id
ALTER TABLE public.agency_bookings DROP CONSTRAINT IF EXISTS agency_bookings_inquiry_id_fkey;
ALTER TABLE public.agency_bookings DROP COLUMN IF EXISTS inquiry_id;
DROP INDEX IF EXISTS idx_agency_bookings_inquiry;
CREATE INDEX IF NOT EXISTS idx_agency_bookings_source_inquiry
  ON public.agency_bookings (source_inquiry_id)
  WHERE source_inquiry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agency_bookings_client_account
  ON public.agency_bookings (client_account_id)
  WHERE client_account_id IS NOT NULL;
-- ---------------------------------------------------------------------------
-- booking_talent
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_talent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.agency_bookings (id) ON DELETE CASCADE,
  talent_profile_id UUID REFERENCES public.talent_profiles (id) ON DELETE SET NULL,
  talent_name_snapshot TEXT,
  profile_code_snapshot TEXT,
  role_label TEXT,
  pricing_unit public.pricing_unit NOT NULL DEFAULT 'event',
  units NUMERIC(10, 2) NOT NULL DEFAULT 1,
  talent_cost_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  client_charge_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  talent_cost_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  client_charge_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_talent_booking
  ON public.booking_talent (booking_id, sort_order);
ALTER TABLE public.booking_talent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_talent_staff_all ON public.booking_talent;
CREATE POLICY booking_talent_staff_all ON public.booking_talent
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
-- Migrate legacy single-talent column into booking_talent
INSERT INTO public.booking_talent (
  booking_id,
  talent_profile_id,
  sort_order,
  talent_name_snapshot,
  profile_code_snapshot
)
SELECT
  b.id,
  b.talent_profile_id,
  0,
  tp.display_name,
  tp.profile_code
FROM public.agency_bookings b
LEFT JOIN public.talent_profiles tp ON tp.id = b.talent_profile_id
WHERE b.talent_profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_talent bt WHERE bt.booking_id = b.id
  );
ALTER TABLE public.agency_bookings DROP COLUMN IF EXISTS talent_profile_id;
-- ---------------------------------------------------------------------------
-- booking_activity_log (audit hook)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.agency_bookings (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_activity_log_booking
  ON public.booking_activity_log (booking_id, created_at DESC);
ALTER TABLE public.booking_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_activity_log_staff_all ON public.booking_activity_log;
CREATE POLICY booking_activity_log_staff_all ON public.booking_activity_log
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
-- ---------------------------------------------------------------------------
-- agency_bookings RLS: staff + client visibility rules
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS agency_bookings_client_select ON public.agency_bookings;
CREATE POLICY agency_bookings_client_select ON public.agency_bookings
  FOR SELECT
  USING (
    (
      client_visible_at IS NOT NULL
      AND (
        client_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.client_account_contacts c
          WHERE c.id = agency_bookings.client_contact_id
            AND c.profile_user_id = auth.uid()
            AND c.archived_at IS NULL
        )
      )
    )
    OR (
      source_inquiry_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.inquiries i
        WHERE i.id = agency_bookings.source_inquiry_id
          AND i.client_user_id = auth.uid()
      )
    )
  );
-- ---------------------------------------------------------------------------
-- guest_submit_inquiry: set source_channel for guest path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guest_submit_inquiry(
  p_session_key TEXT,
  p_contact_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_company TEXT,
  p_event_type_id UUID DEFAULT NULL,
  p_event_date DATE DEFAULT NULL,
  p_event_location TEXT DEFAULT NULL,
  p_quantity INT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_raw_ai_query TEXT DEFAULT NULL,
  p_interpreted_query JSONB DEFAULT NULL,
  p_source_page TEXT DEFAULT NULL,
  p_talent_ids UUID[] DEFAULT NULL
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
    event_date,
    event_location,
    quantity,
    message,
    event_type_id,
    raw_ai_query,
    interpreted_query,
    source_page,
    source_channel,
    status
  )
  VALUES (
    gid,
    NULL,
    trim(p_contact_name),
    trim(p_contact_email),
    NULLIF(trim(p_contact_phone), ''),
    NULLIF(trim(p_company), ''),
    p_event_date,
    NULLIF(trim(COALESCE(p_event_location, '')), ''),
    CASE WHEN p_quantity IS NOT NULL AND p_quantity > 0 THEN p_quantity ELSE NULL END,
    NULLIF(trim(p_message), ''),
    p_event_type_id,
    NULLIF(trim(COALESCE(p_raw_ai_query, '')), ''),
    p_interpreted_query,
    NULLIF(trim(COALESCE(p_source_page, '')), ''),
    'directory_guest'::public.inquiry_source_channel,
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
