-- Add 'refunded' to the agency_bookings.payment_status enum.
--
-- BUG (found 2026-06-13 QA): on a FULL refund (charge.refunded → handleBookingRefund)
-- and on a LOST dispute (charge.dispute.closed lost → handleBookingDispute), the
-- shared markBookingRefunded() helper updates agency_bookings with
--   { client_revenue_lifecycle: 'refunded', payment_status: 'refunded', payout_lifecycle: 'pending' }
-- in a SINGLE UPDATE. The payment_status enum only had {unpaid, partial, paid, cancelled},
-- so 'refunded' raised 22P02 (invalid enum value) and aborted the ENTIRE update — leaving the
-- booking row stuck at payment_status='paid' / client_revenue_lifecycle='fully_paid' AFTER a full
-- refund (the Stripe transfers WERE correctly reversed and the booking_transactions row flipped to
-- 'refunded', but agency_bookings lied about being fully paid → dashboards/client/KPIs all wrong).
--
-- client_revenue_lifecycle already allows 'refunded'; the payment_status enum just omitted it.
-- The application code (refunds.ts markBookingRefunded) is already correct — this only adds the
-- missing enum value so the write succeeds.

alter type public.payment_status add value if not exists 'refunded';
