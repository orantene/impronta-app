-- Why the Bookable "Turn off" could not work for a person with their own sign-in.
select (settings->'appointments') as appts
from public.agencies where id='33333333-3333-4333-8333-333333333333';
-- OUTPUT: {"enabled":true,"timezone":"America/Mexico_City","terminology":"appointments","allowTalentDirectBooking":true}
-- The engine's agency gate is `workspaceAllow OR roster.direct_booking_enabled`
-- (web/src/lib/scheduling/appointment-policy.ts:213), so with this switch on the
-- per-person column is inert. Observed before the fix: the panel said "Saved.",
-- agency_talent_roster.direct_booking_enabled was false for the Talent, and the
-- hat and the booking page both still said On. Restored to true by hand
-- (the only write in this run not made through the interface) before re-running.
