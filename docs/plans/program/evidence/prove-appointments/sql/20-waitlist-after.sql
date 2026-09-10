-- Read back 2026-09-10 ~16:52Z. Three passing runs of classes-and-waitlist.spec.ts, each its own
-- night (created on the Events page + Schedule a night; seats 2, raised to 3 on the Events page).
select s.title, s.series_id, p.units_total, e.customer_name, e.status, e.accepted_allocation_id,
       a.state as alloc_state, a.units as alloc_units, a.order_line_id,
       (select count(*) from capacity_allocations c where c.pool_id = p.id and c.state = 'committed') as committed_rows,
       (select coalesce(sum(units), 0) from capacity_allocations c where c.pool_id = p.id and c.state = 'committed') as committed_units
  from sessions s
  join capacity_pools p on p.subject_id = s.id and p.subject_kind = 'session_tier'
  left join session_waitlist_entries e on e.session_id = s.id
  left join capacity_allocations a on a.id = e.accepted_allocation_id
 where s.tenant_id = '33333333-3333-4333-8333-333333333333'
   and s.title like 'Prove class %' and s.created_at > now() - interval '25 minutes'
 order by s.created_at, e.joined_at;
-- title                       series_id  units  customer     status     alloc_state  order_line_id  committed_rows  committed_units
-- Prove class 1789058826481   null       3      Ana Espera   withdrawn  released     null           3               3
-- Prove class 1789058826481   null       3      Beto Espera  accepted   committed    null           3               3
-- (same shape for 1789058061008 and 1789058432994)
-- Reading: two ticket seats + Beto's accepted place = 3 committed of 3; Ana's released seat is the
-- one she gave back; the accepted place is a real committed allocation with no order line.
