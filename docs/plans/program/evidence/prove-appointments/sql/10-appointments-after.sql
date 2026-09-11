-- Read back 2026-09-10 ~16:50Z after the passing runs (markers written by the public /book page,
-- moved by Operate > Appointments > Move it). AFTER the fixes: a paid booking's hold has no expiry,
-- a moved booking's hold moved with it, a refused move left both where they were.
select b.contact_name, o.status as order_status, b.status as booking_status,
       b.starts_at as booking_starts, b.ends_at as booking_ends,
       h.starts_at as hold_starts, h.expires_at as hold_expires, tp.display_name as person
  from agency_bookings b
  join orders o on o.id = b.order_id
  left join talent_holds h on h.operation_key = 'order:' || o.id || ':reserve'
  left join talent_profiles tp on tp.id = h.talent_profile_id
 where b.tenant_id = '33333333-3333-4333-8333-333333333333'
   and b.created_at > now() - interval '30 minutes'
   and (b.contact_name like 'appt-%' or b.contact_name like 'busy-%' or b.contact_name like 'room-%')
 order by b.created_at, tp.display_name;
-- (excerpt; every row had hold_expires = null)
-- contact_name              order   booking_starts           hold_starts              person
-- appt-board-1789058963292  paid    2026-09-10 23:15:00+00   2026-09-10 23:15:00+00   QA Journeys Therapist B
-- appt-move-1789058651469   paid    2026-09-12 22:30:00+00   2026-09-12 22:30:00+00   QA Journeys Therapist B   <- moved together
-- busy-a-1789058674473      paid    2026-09-10 22:30:00+00   2026-09-10 22:30:00+00   QA Journeys Therapist B
-- busy-b-1789058674473      paid    2026-09-11 15:00:00+00   2026-09-11 15:00:00+00   QA Journeys Therapist B   <- refused, unchanged
-- appt-stale-1789058712699  paid    2026-09-13 23:15:00+00   2026-09-13 23:15:00+00   QA Journeys Therapist B   <- colleague's move stands
-- room-a-1789058744572      paid    2026-09-23 22:30:00+00   2026-09-23 22:30:00+00   QA Journeys Talent / Therapist B (two holds)
-- room-b-1789058744572      paid    2026-09-23 16:30:00+00   2026-09-23 16:30:00+00   QA Journeys Talent / Therapist B  <- refused (Room A), unchanged
-- The one row with hold_starts = null is appt-board-1789057224664, a Gel manicure (deposit, card in
-- flight) booked BEFORE the tests moved to the settled $0 service; its hold kept its TTL by design
-- and was reaped. A deposit booking is committed when the card clears (complete-order.ts).
