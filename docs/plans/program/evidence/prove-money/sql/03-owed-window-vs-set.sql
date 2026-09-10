-- Run 7, 2026-09-10 ~16:35Z, against qa-journeys (fxlankepwnvelxjrahwk), host serving
-- program/journeys-2026-09 @ ab1737155 (git build dpl_8pZj6qiw…), BEFORE the owed fix.
-- The screen printed "Still owed $821.00". The rows say:
with t as (
  select o.id, o.status, o.total_cents, o.created_at,
         coalesce((select sum(gross_amount_cents) from booking_transactions b
                   where b.order_id = o.id and b.status = 'paid'), 0) as collected
  from orders o where o.tenant_id = '33333333-3333-4333-8333-333333333333'),
owed as (select *, greatest(0, total_cents - collected) as owed
         from t where status = 'pending_payment' and total_cents > 0),
win as (select * from t order by created_at desc limit 200)
select (select count(*) from t)                                   as orders_total,          -- 286
       (select count(*) from owed)                                as owed_rows,             -- 46
       (select sum(owed) from owed)                               as owed_all_cents,        -- 120900  ($1,209.00, the truth)
       (select sum(greatest(0, total_cents - collected)) from win
         where status = 'pending_payment' and total_cents > 0)    as owed_window200_cents,  -- 82100   ($821.00, what the screen showed)
       (select count(*) from win
         where status = 'pending_payment' and total_cents > 0)    as owed_rows_in_window;   -- 28
-- Result: {"orders_total":286,"owed_rows":46,"owed_all_cents":"120900","owed_window200_cents":"82100","owed_rows_in_window":28}

-- Run 9, 2026-09-10 17:40:50Z, host serving program/journeys-2026-09 @ dcefb0b2 (git build
-- dpl_FzVvzxTT…, merge work/prove-people-projects), still before the owed fix.
-- Screen printed "Still owed $713.00". Same query:
-- {"orders_total":299,"owed_rows":46,"owed_all_cents":"120900","owed_window200_cents":"71300"}
-- The true figure did not move ($1,209.00, 46 orders); the screen's figure fell from
-- $821.00 to $713.00 as 13 newer orders pushed older unpaid ones out of the 200-row window.
