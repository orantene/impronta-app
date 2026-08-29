-- Per-roster-row agency gate for public appointments (Orlando / D1 overlap).
-- Default OFF: enabling one talent does not open the whole roster.
-- Workspace settings.appointments.allowTalentDirectBooking is the fallback.

BEGIN;

ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS direct_booking_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agency_talent_roster.direct_booking_enabled IS
  'Agency-side half of the public-booking AND-gate for this roster row. Default false. Workspace allowTalentDirectBooking is the fallback when this is false.';

COMMIT;
