-- Wave 2 — surface booking gates (LABOR / CHANNEL / CONTRACT).
--
-- external_booking_released is the CONTRACT veto release: an exclusive
-- primary agency must flip this to let the talent take bookings on
-- channels outside that agency's own site (own page, hub, a secondary
-- workspace). It is deliberately NOT the same column as
-- direct_booking_enabled (the agency's switch for ITS OWN site).
--
-- New non-exclusive roster rows default display ON. Existing rows are
-- left untouched (appointments stay dark until a human acts).

ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS external_booking_released boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agency_talent_roster.external_booking_released IS
  'Exclusive-agency release for booking channels outside this tenant''s own site. Default false. Distinct from direct_booking_enabled.';

ALTER TABLE public.agency_talent_roster
  ALTER COLUMN direct_booking_enabled SET DEFAULT true;
