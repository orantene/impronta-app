-- Run 2026-09-10 16:02Z, right after VENUE-join-and-refusal passed
-- (gates/playwright-VENUE-join-and-refusal.log). Branch fxlankepwnvelxjrahwk.

select v.id, v.space_id, v.joined_space_id, v.party_size, v.service_kind, v.status,
       v.opened_at, v.closed_at,
       (select count(*) from public.orders o where o.visit_id = v.id) as orders,
       (select string_agg(o.status::text || ' ' || o.total_cents, ',')
          from public.orders o where o.visit_id = v.id) as order_states
from public.visits v
where v.tenant_id = '33333333-3333-4333-8333-333333333333'
  and v.space_id in ('33330011-0000-4000-8000-000000000011',   -- T2
                     '33330011-0000-4000-8000-000000000012')   -- T3
  and v.opened_at > now() - interval '10 minutes';

-- RESULT: exactly ONE visit for the two tables.
-- 567bd01d-8477-4413-bd1e-ed8918f51b18
--   space_id T2 (…0011)  joined_space_id T3 (…0012)  party_size 4  service_kind table
--   opened 16:01:11.055Z  closed 16:01:15.146Z (End visit on the T2 card)  status closed
--   orders 1  ->  "draft 0"   (one check for the joined seating; nothing was rung on it)
--
-- The refusal that preceded the join was the engine's `party_too_large`
-- (4 at a two-top), rendered as "This party is larger than the table allows."
-- (screenshots/join/floor-refusal-and-join-offer.png), with "Join with T3"
-- offered from the space_combinations row T2<->T3 (3 to 4).
--
-- spaces.needs_reset_at for T2 and T3: both set by the close (the cards read
-- "Needs reset"), T2 cleared by "Mark ready" in the journey, T3 cleared by the
-- teardown. Both NULL at the time of this query.
