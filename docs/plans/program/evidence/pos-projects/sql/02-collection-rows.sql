-- pos-projects: the cash collection the till recorded, traced to its rows.
-- B. PAID transactions on the project's orders, with the till's stamps.
select t.id as transaction_id, t.order_id, t.status, t.gross_amount_cents, t.provider,
       t.metadata->>'paid_via' as paid_via, t.metadata->>'shift_id' as shift_id,
       t.metadata->>'operation_key' as operation_key, t.created_at
from booking_transactions t
join orders o on o.id = t.order_id
where o.inquiry_id = ':inquiry'
order by t.created_at;
