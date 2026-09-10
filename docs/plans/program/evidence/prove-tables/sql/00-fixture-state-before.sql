-- Run 2026-09-10 ~14:55Z against Supabase branch fxlankepwnvelxjrahwk (qa-journeys), read only.
-- What the floor carried BEFORE any journey ran. Nothing was seeded by this run:
-- the floor block of supabase/seed_journeys_program.sql (commit 00ffa4717) was
-- already applied, as these rows show.

select id, code, kind, party_min, party_max, status, needs_reset_at
from public.spaces
where tenant_id = '33333333-3333-4333-8333-333333333333'
order by sort_order, code;
-- R1 room 1-2 | T1 table 1-4 | T2 table 1-2 | T3 table 1-2 | T4 table 2-4 | B1 booth 4-6 | T5 table 1-2

select space_id, with_space_id, party_min, party_max
from public.space_combinations
where tenant_id = '33333333-3333-4333-8333-333333333333';
-- T2<->T3 3-4 (both directions), T3<->T4 5-6 (both directions)

select id, holder_name, space_id, party_size, admitted_count, starts_at, status
from public.admissions
where tenant_id = '33333333-3333-4333-8333-333333333333'
  and id::text like '33330040-%';
-- Ana Ruiz -> T4 (2, 0 admitted), Beto Salas -> B1 (5, 0), Carla Nieto -> T3 (4, 0),
-- Diego Paz -> T1 (4, 4). starts_at stamped 2026-09-10 ~10:10Z by the seed's now().
-- No admission named 'Prove Tables %' existed: the previous run never took a walk-in.

select p.id, p.subject_kind, p.units_total,
       (select count(*) from public.capacity_allocations a
         where a.pool_id = p.id and a.state in ('hold','committed') and a.ends_at > now()) as live
from public.capacity_pools p
where p.tenant_id = '33333333-3333-4333-8333-333333333333';
-- band pool 33330020-...-0002 (space_group, 4 units): 0 live allocations.

select id, status, destination, station, revision, created_at
from public.preparation_tickets
where tenant_id = '33333333-3333-4333-8333-333333333333'
order by created_at desc;
-- 3 tickets from other journeys (2 queued pickup, 1 ready pickup), none for a table.
