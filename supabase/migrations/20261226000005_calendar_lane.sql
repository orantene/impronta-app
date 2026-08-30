-- Menu Phase 1: calendar lane for menu orders (distinct from appointment bookings).
-- Nullable; only 'order' is valid for now. Do NOT overload booking_sub_type —
-- that column is the payout/fulfillment axis.

BEGIN;

ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS calendar_lane text NULL;

ALTER TABLE public.agency_bookings
  DROP CONSTRAINT IF EXISTS agency_bookings_calendar_lane_check;

ALTER TABLE public.agency_bookings
  ADD CONSTRAINT agency_bookings_calendar_lane_check
  CHECK (calendar_lane IS NULL OR calendar_lane IN ('order'));

COMMENT ON COLUMN public.agency_bookings.calendar_lane IS
  'Optional calendar presentation lane. ''order'' = Menu order (shows under Orders; must not consume appointment slots).';

CREATE INDEX IF NOT EXISTS idx_agency_bookings_calendar_lane
  ON public.agency_bookings (tenant_id, calendar_lane)
  WHERE calendar_lane IS NOT NULL;

COMMIT;
