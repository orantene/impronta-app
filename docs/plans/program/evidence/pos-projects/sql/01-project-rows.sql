-- pos-projects: the rows behind the proof, on the isolated branch (qa-journeys).
-- Run from web/ with the isolated env exported:
--   SQL="$(cat ../docs/plans/program/evidence/pos-projects/sql/01-project-rows.sql)" \
--   node --input-type=module -e "$(cat ../docs/plans/program/evidence/pos-projects/sql/read-rows.mjs)"
-- Replace :inquiry with the inquiry id the run annotated.
--
-- A. The project and every order attached to its conversation, with the two
--    rules side by side: the desk's (`pending_payment` only, minus PAID
--    transactions) and the naive one (total - collected over every row).
with attached as (
  select o.id, o.status, o.currency, o.total_cents, o.receipt_code, o.version, o.created_at,
         coalesce((select sum(t.gross_amount_cents) from booking_transactions t
                   where t.order_id = o.id and t.status = 'paid'), 0) as collected_cents
  from orders o
  where o.inquiry_id = ':inquiry'
)
select b.id as project_id, b.status as project_status, b.contact_name,
       a.id as order_id, a.status, a.total_cents, a.collected_cents, a.receipt_code, a.version,
       case when a.status = 'pending_payment' then greatest(a.total_cents - a.collected_cents, 0) else 0 end as owed_by_desk_rule,
       greatest(a.total_cents - a.collected_cents, 0) as owed_by_naive_rule
from agency_bookings b
left join attached a on true
where b.source_inquiry_id = ':inquiry'
order by a.created_at;
