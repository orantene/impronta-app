-- Run 2026-09-10 16:24Z, after VENUE-refusals-in-words passed twice over
-- (en, es; gates/playwright-VENUE-refusals-in-words.log). Branch fxlankepwnvelxjrahwk.

-- The kitchen refusal is made by two stations on ONE ticket: station one
-- acknowledges, station two taps the button it is still showing and is refused
-- `invalid_state`. The row shows exactly one acknowledgement per pass.
select t.id, t.destination, t.revision, t.acknowledged_at, t.cancelled_at,
       o.status as order_status, o.total_cents, t.created_at
from public.preparation_tickets t join public.orders o on o.id = t.order_id
where t.tenant_id = '33333333-3333-4333-8333-333333333333'
  and t.destination = 'counter' and t.created_at > '2026-09-10T16:18:00Z'
order by t.created_at;
-- f2fb7289-…  counter  rev 1  acknowledged_at 16:18:27.601Z (en pass)   order cancelled  1800
-- bb9fa7b6-…  counter  rev 1  acknowledged_at 16:19:19.931Z (es pass)   order cancelled  1800
-- cancelled_at 16:22:59Z on both: set by THIS run's SQL below, not by the product.

-- The floor refusal writes nothing, which is the point: six at a two-top is
-- refused by `openVisit` before any row exists. Checked: no visit on T2 was
-- opened during those passes (the join journey's 16:01Z visit is the only one).
select count(*) as visits_on_t2_during_refusal_passes
from public.visits
where space_id = '33330011-0000-4000-8000-000000000011'
  and opened_at between '2026-09-10T16:18:00Z' and '2026-09-10T16:22:00Z';
-- 0

-- WHAT THE REFUSAL PASSES LEFT BEHIND, AND THE DEFECT IT SHOWED. Each pass
-- ends with the counter's own "Cancel sale". The sale went to `cancelled` and
-- its ticket stayed ACKNOWLEDGED on the kitchen board: six tickets for six
-- cancelled sales across the day's runs. `cancelTicket` had no caller. Fixed
-- in lib/pos/finalize.ts (see README); the rows already written were
-- withdrawn by hand on the fixture:
update public.preparation_tickets t
   set status = 'cancelled', cancelled_at = now(), updated_at = now()
  from public.orders o
 where o.id = t.order_id
   and t.tenant_id = '33333333-3333-4333-8333-333333333333'
   and o.status = 'cancelled' and t.status <> 'cancelled';
-- 6 rows: 62abbb6b-…, b83070af-…, b7e1786a-…, 641b980e-…, f2fb7289-…, bb9fa7b6-…

-- FIXTURE WRITES MADE BY THIS RUN, all on the isolated branch, none on production:
--   * two leftover tickets of aborted attempts cancelled by id (7547d3bd-…, 6f5c6125-…)
--   * the six above
--   * app_locales: a `fr` row was INSERTED at 16:03Z to try the French pass and
--     DELETED again at 16:15Z once it was clear a workspace cannot publish it
--     (PLATFORM_LOCALES + CHECK constraint, see README). Net change: none.
-- No row this journey was proving was ever inserted by hand.
