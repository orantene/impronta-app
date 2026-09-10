-- Run 2026-09-10 16:00Z, right after VENUE-table-service passed (run log:
-- gates/playwright-VENUE-table-service.log). Branch fxlankepwnvelxjrahwk.
-- The spec's own DB assertions ran BEFORE its afterEach teardown; this query
-- ran AFTER it, so two columns show the teardown's hand and are marked.

with a as (
  select * from public.admissions
  where tenant_id = '33333333-3333-4333-8333-333333333333'
    and holder_name like 'Prove Tables %'
  order by created_at desc limit 1
)
select 'admission', a.id, a.holder_name, a.party_size, a.admitted_count, a.space_id, a.seated_at, a.status, a.allocation_id from a
union all select 'allocation', c.id, c.pool_id::text, c.units, null, null, c.starts_at, c.state::text, c.released_at::text
  from a join public.capacity_allocations c on c.id = a.allocation_id
union all select 'visit', v.id, v.service_kind, v.party_size, v.version, v.space_id, v.closed_at, v.status::text, v.joined_space_id::text
  from public.visits v where v.space_id = '33330011-0000-4000-8000-000000000013' and v.opened_at > now() - interval '15 minutes'
union all select 'order', o.id, o.source_channel, o.total_cents, null, o.space_id, o.updated_at, o.status::text, o.visit_id::text
  from public.orders o join public.visits v on v.id = o.visit_id
  where v.space_id = '33330011-0000-4000-8000-000000000013' and v.opened_at > now() - interval '15 minutes'
union all select 'ticket', t.id, t.station || '/' || t.destination, t.revision, null, null, t.acknowledged_at, t.status::text, t.order_id::text
  from public.preparation_tickets t join public.visits v on v.id = t.visit_id
  where v.space_id = '33330011-0000-4000-8000-000000000013' and v.opened_at > now() - interval '15 minutes'
union all select 'revision', r.id, 'rev ' || r.revision, jsonb_array_length(r.snapshot->'lines'), null, null, r.created_at, null, r.ticket_id::text
  from public.preparation_ticket_revisions r join public.preparation_tickets t on t.id = r.ticket_id
  join public.visits v on v.id = t.visit_id
  where v.space_id = '33330011-0000-4000-8000-000000000013' and v.opened_at > now() - interval '15 minutes';

-- RESULT (the passing run is the one at 15:58Z; the 15:55Z and 15:57Z rows are
-- the two attempts that failed later in the journey, see README):
--
-- admission  bede7d5d-17f9-4fbb-b2c8-202f189ccd2e  "Prove Tables 1789055878435"
--            party_size 3  admitted_count 3  space_id T4 (…0013)
--            seated_at 2026-09-10 15:58:10.727Z
--            status void                         <- teardown (releaseVenueJourneyParty)
--            allocation_id 70878ba9-…
-- allocation 70878ba9-…  pool 33330020-…-0002 (the two-to-four band)  units 1
--            15:58:07Z -> 17:28:07Z (a 90-minute turn from "now")
--            state released, released_at 15:58:56Z   <- teardown; it was committed during the run
-- visit      31246727-ec5e-44b1-9390-f00e131ec7bc  table  party_size 3  version 2
--            space_id T4  opened 15:58:10.513Z  closed 15:58:53.22Z  status closed  joined null
-- order      2b59b8fc-8048-4380-8261-898ec185d642  pos  total_cents 3600  status paid
--            visit_id 31246727-…  space_id T4
-- ticket     3b2a722d-af63-40fd-9abc-9d6d6d16c384  kitchen/table  revision 2
--            acknowledged_at 15:58:38.521Z  status acknowledged  order_id 2b59b8fc-…
-- revision   917c767d-…  rev 1  1 line   15:58:20Z   ticket 3b2a722d-…
-- revision   9f006c37-…  rev 2  2 lines  15:58:33Z   ticket 3b2a722d-…
--
-- ONE ticket for the order across two sends; the second send is revision 2.
-- spaces.needs_reset_at for T4 was 15:58:53Z when the spec asserted it (the card
-- read "vacated 09:58", Mexico City) and is NULL now: the teardown clears it.
