-- Observed 2026-09-10 ~15:05Z on the isolated branch (fxlankepwnvelxjrahwk), BEFORE
-- 20261231030700_reschedule_moves_order_holds.sql was applied. The booking rows were
-- written by the public /book page and moved from Operate > Appointments > Move it
-- by the journey spec (markers appt-move-*, appt-stale-*).
select b.contact_name, b.starts_at as booking_starts, b.ends_at as booking_ends,
       h.starts_at as hold_starts, h.talent_profile_id
  from agency_bookings b
  join talent_holds h on h.operation_key = 'order:' || b.order_id || ':reserve'
 where b.tenant_id = '33333333-3333-4333-8333-333333333333'
   and b.contact_name like 'appt-%'
 order by b.created_at desc;
-- contact_name             booking_starts           hold_starts
-- appt-stale-1789052497174 2026-09-13 18:00:00+00   2026-09-10 18:00:00+00   <- moved by a colleague, person stayed
-- appt-move-1789052478291  2026-09-12 17:15:00+00   2026-09-10 17:15:00+00   <- "Moved to Sat, Sep 12", person stayed Thu
-- appt-board-1789052454799 2026-09-10 16:30:00+00   2026-09-10 16:30:00+00
-- appt-board-1789052417383 2026-09-10 15:45:00+00   2026-09-10 15:45:00+00
-- appt-board-1789052382040 2026-09-10 15:00:00+00   2026-09-10 15:00:00+00
