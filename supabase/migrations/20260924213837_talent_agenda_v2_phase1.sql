-- Agenda V2 T1.3 / T1.7 / T2.5 / T6.4 intake + T1.8 reschedule requests
-- Additive only.

BEGIN;

-- T1.3: no_show on commercial booking_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'booking_status' AND e.enumlabel = 'no_show'
  ) THEN
    ALTER TYPE public.booking_status ADD VALUE 'no_show';
  END IF;
END $$;

-- T1.3: talent_bookings status check includes no_show (still occupies time)
ALTER TABLE public.talent_bookings DROP CONSTRAINT IF EXISTS talent_bookings_status_check;
-- Recreate via drop of the inline check: Postgres names it talent_bookings_status_check
-- when created as COLUMN CHECK; if unnamed, find it.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.talent_bookings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%confirmed%completed%cancelled%'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.talent_bookings DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.talent_bookings
  ADD CONSTRAINT talent_bookings_status_check
  CHECK (status IN ('confirmed', 'completed', 'cancelled', 'no_show'));

-- T1.7 travel mirrored on calendar copy for busy reads
ALTER TABLE public.talent_bookings
  ADD COLUMN IF NOT EXISTS travel_before_min integer,
  ADD COLUMN IF NOT EXISTS travel_after_min integer;

ALTER TABLE public.talent_bookings
  DROP CONSTRAINT IF EXISTS talent_bookings_travel_before_min_check,
  DROP CONSTRAINT IF EXISTS talent_bookings_travel_after_min_check;

ALTER TABLE public.talent_bookings
  ADD CONSTRAINT talent_bookings_travel_before_min_check
    CHECK (travel_before_min IS NULL OR travel_before_min >= 0),
  ADD CONSTRAINT talent_bookings_travel_after_min_check
    CHECK (travel_after_min IS NULL OR travel_after_min >= 0);

ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS travel_before_min integer,
  ADD COLUMN IF NOT EXISTS travel_after_min integer;

ALTER TABLE public.agency_bookings
  DROP CONSTRAINT IF EXISTS agency_bookings_travel_before_min_check,
  DROP CONSTRAINT IF EXISTS agency_bookings_travel_after_min_check;

ALTER TABLE public.agency_bookings
  ADD CONSTRAINT agency_bookings_travel_before_min_check
    CHECK (travel_before_min IS NULL OR travel_before_min >= 0),
  ADD CONSTRAINT agency_bookings_travel_after_min_check
    CHECK (travel_after_min IS NULL OR travel_after_min >= 0);

-- T2.5 client timezone for dual display
ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS client_timezone text;

-- T6.4 intake status + resend (D6: status only)
ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS intake_status text,
  ADD COLUMN IF NOT EXISTS intake_sent_at timestamptz;

ALTER TABLE public.agency_bookings
  DROP CONSTRAINT IF EXISTS agency_bookings_intake_status_check;

ALTER TABLE public.agency_bookings
  ADD CONSTRAINT agency_bookings_intake_status_check
  CHECK (intake_status IS NULL OR intake_status IN ('none', 'pending', 'complete', 'waived'));

-- T1.8 reschedule requests
CREATE TABLE IF NOT EXISTS public.booking_reschedule_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
  requested_by text NOT NULL CHECK (requested_by IN ('talent', 'client')),
  new_starts_at timestamptz NOT NULL,
  new_ends_at timestamptz NOT NULL,
  fee_cents integer NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'conflict')),
  hold_id uuid REFERENCES public.talent_holds(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_reschedule_requests_time_check CHECK (new_ends_at > new_starts_at)
);

CREATE INDEX IF NOT EXISTS idx_booking_reschedule_requests_booking
  ON public.booking_reschedule_requests (booking_id, status);

ALTER TABLE public.booking_reschedule_requests ENABLE ROW LEVEL SECURITY;

COMMIT;
