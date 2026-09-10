-- Run 13 (PASS, traced), 2026-09-10 ~18:25Z, host = prebuilt dpl of program/journeys-2026-09
-- @ dcefb0b2 + work/prove-money (tulala-j2lwj3627). Database: qa-journeys fxlankepwnvelxjrahwk.
-- Each block is the page's own rule restated; the output file beside this one is what it returned.

-- A. The buyer this run named at the counter, and the sale on their record (client record, screenshot 09).
select c.id as customer_id, c.email, o.id as order_id, o.status, o.total_cents,
       coalesce((select sum(gross_amount_cents) from booking_transactions b where b.order_id=o.id and b.status='paid'),0) as collected_cents
  from customers c join orders o on o.customer_id=c.id
 where c.tenant_id='33333333-3333-4333-8333-333333333333' and c.email like 'money-%@impronta.test'
 order by o.created_at desc limit 3;

-- B. The three counter sales of the latest run, by status (paid, cancelled, draft) — none is owed.
select o.id, o.status, o.total_cents, o.source_channel, o.created_at
  from orders o where o.tenant_id='33333333-3333-4333-8333-333333333333' and o.source_channel='pos'
 order by o.created_at desc limit 3;

-- C. Takings by method (Payments, first table): PAID transactions grouped by provider + metadata.paid_via.
select case when provider='manual' then coalesce(metadata->>'paid_via','manual_other') else provider end as method,
       upper(currency) as currency, count(*) as transactions, sum(gross_amount_cents) as amount_cents
  from booking_transactions where source_tenant_id='33333333-3333-4333-8333-333333333333' and status='paid'
 group by 1,2 order by 1,2;

-- D. Still owed (Payments): every pending_payment order with a positive total, minus what landed. Whole set, no window.
select count(*) as owed_orders, sum(greatest(0, o.total_cents - coalesce((select sum(gross_amount_cents) from booking_transactions b where b.order_id=o.id and b.status='paid'),0))) as owed_cents,
       (select count(*) from orders where tenant_id='33333333-3333-4333-8333-333333333333') as orders_in_workspace
  from orders o where o.tenant_id='33333333-3333-4333-8333-333333333333' and o.status='pending_payment' and o.total_cents>0;

-- E. Refunds (Payments): none exist on this fixture, so the page must say "No refunds yet."
select count(*) as refunded_rows from booking_transactions where source_tenant_id='33333333-3333-4333-8333-333333333333' and status='refunded';

-- F. The drawer this run opened and closed: float, expected = float + cash stamped with it, counted, variance.
select s.id, s.status, s.opening_cash_cents, s.expected_cash_cents, s.closing_cash_cents,
       s.closing_cash_cents - s.expected_cash_cents as variance_cents, s.opened_at, s.closed_at,
       (select json_agg(json_build_object('txn',b.id,'order',b.order_id,'cents',b.gross_amount_cents,'paid_via',b.metadata->>'paid_via'))
          from booking_transactions b where b.status='paid' and b.metadata->>'shift_id'=s.id::text) as cash_rows
  from pos_shifts s where s.tenant_id='33333333-3333-4333-8333-333333333333' order by s.opened_at desc limit 1;

-- G. The project (booking from the accepted offer) and its orders: Due = sum of owed over attached orders = 0 after the cancel.
select b.id as booking_id, b.status as booking_status, i.status as inquiry_status,
       (select json_agg(json_build_object('order',o.id,'status',o.status,'total',o.total_cents)) from orders o where o.inquiry_id=i.id) as orders,
       (select sum(case when o.status='pending_payment' and o.total_cents>0 then greatest(0,o.total_cents-coalesce((select sum(gross_amount_cents) from booking_transactions t where t.order_id=o.id and t.status='paid'),0)) else 0 end) from orders o where o.inquiry_id=i.id) as due_cents,
       (select sum(greatest(0,o.total_cents)) from orders o where o.inquiry_id=i.id) as naive_total_minus_collected_cents
  from agency_bookings b join inquiries i on i.id=b.source_inquiry_id where i.id='6a5e9455-e7ed-46dd-a53e-d26064e8b780';
