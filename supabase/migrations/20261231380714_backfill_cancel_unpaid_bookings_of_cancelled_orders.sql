-- TUL-706 backfill (NOT APPLIED; for the PM to schedule).
-- Unpaid, confirmed bookings whose order is cancelled can never be paid, yet
-- they read Confirmado and their talent_bookings mirror keeps the slot busy.
-- Prod count on 2026-10-14: 7 bookings (3 busy talent rows).
-- Same guards as cancelUnpaidBookings: only status='confirmed' and
-- payment_status='unpaid'; paid money is never touched. Idempotent.

with stuck as (
  select b.id, b.source_inquiry_id
  from public.agency_bookings b
  join public.orders o on o.id = b.order_id
  where b.status = 'confirmed'
    and b.payment_status = 'unpaid'
    and o.status = 'cancelled'
),
talent as (
  update public.talent_bookings tb
     set status = 'cancelled'
    from stuck s
   where tb.inquiry_id = s.source_inquiry_id
     and tb.status = 'confirmed'
  returning tb.id
)
update public.agency_bookings b
   set status = 'cancelled'
  from stuck s
 where b.id = s.id
   and b.status = 'confirmed'
   and b.payment_status = 'unpaid';
