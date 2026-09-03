-- One talent, one time.
--
-- talent_holds already carries a gist exclusion so two people cannot hold the
-- same window. Nothing enforced the same rule on the bookings themselves, so a
-- confirmed booking and a firm hold could be written over each other: slot
-- computation subtracts busy time, but that read is advisory and racy.
--
-- The key is talent_profile_id ALONE, deliberately NOT (tenant_id,
-- talent_profile_id). A talent's time is theirs across every tenant that lists
-- them. Keying on tenant as well would let agency A and agency B each book the
-- same person at 3pm, which is the exact failure the one-calendar model exists
-- to prevent.
--
-- The range is half-open so back-to-back appointments (10:00-11:00 then
-- 11:00-12:00) do not collide.
--
-- cancelled rows are excluded: cancelling frees the time. completed rows are
-- kept, so history cannot be overwritten.

create extension if not exists btree_gist;

alter table public.talent_bookings
  add constraint talent_bookings_no_overlap
  exclude using gist (
    talent_profile_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('confirmed', 'completed'));

comment on constraint talent_bookings_no_overlap on public.talent_bookings is
  'One talent cannot be booked twice at once, across all tenants. Keyed on talent_profile_id alone by design. Violations raise SQLSTATE 23P01.';
