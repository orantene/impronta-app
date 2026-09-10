-- After "Issue the missing tickets" was pressed on line ae0150ef (order 652bc69b) at ~16:03Z.
select ri.order_line_id, ri.order_id, ri.reason, ri.created_at, ri.executed_at, ri.attempts,
  (select count(*) from public.admissions a where a.order_line_id = ri.order_line_id) as admissions
from public.ticket_refund_intents ri
where ri.tenant_id='33333333-3333-4333-8333-333333333333' order by ri.created_at;
-- OUTPUT:
--   6c296e60 order 59da3895 seat_lost_after_payment created 2026-09-10 12:52:12Z executed null attempts 0 admissions 0  (previous run)
--   ae0150ef order 652bc69b seat_lost_after_payment created 2026-09-10 16:03:42Z executed null attempts 0 admissions 0  (this run's press)
-- The press wrote the refund it promised and minted nothing. With the reader fix,
-- the line leaves the critical list and the order sits in the inbox once, as
-- "Refund owed and not sent" (screenshot 12). Executing the refund needs a
-- payment provider, which this database does not have; that row stays.
