-- D-168: 20261231244000_events_refund_settings re-created
-- ticket_refund_intents_reason_check with only three reasons, dropping
-- `session_cancelled` (20261231217000, session_cancel RPC) and
-- `admission_exchange` (20261231227000 / 20261231232000, admission_exchange
-- RPC). Cancelling a session with a paid seat and exchanging a ticket to a
-- cheaper night both ended in 23514. This re-creates the CHECK with the full
-- union of reasons every writer uses:
--   seat_lost_after_payment  mint-on-paid / capacity-lost compensation
--   event_cancelled          cancel_event cascade
--   session_cancelled        session_cancel
--   admission_exchange       admission_exchange
--   guest_request            ticketRefundRequest (guest ticket page)
-- The static test web/src/lib/sessions/session-ops.test.ts pins the writers'
-- set against the latest definition of this constraint.
ALTER TABLE public.ticket_refund_intents
  DROP CONSTRAINT IF EXISTS ticket_refund_intents_reason_check;
ALTER TABLE public.ticket_refund_intents
  ADD CONSTRAINT ticket_refund_intents_reason_check
  CHECK (reason IN (
    'seat_lost_after_payment',
    'event_cancelled',
    'session_cancelled',
    'admission_exchange',
    'guest_request'
  ));

COMMENT ON COLUMN public.ticket_refund_intents.reason IS
  'seat_lost_after_payment: the hold lapsed between payment and settlement. '
  'event_cancelled: the venue cancelled the event. '
  'session_cancelled: the venue cancelled the session (session_cancel). '
  'admission_exchange: the guest exchanged to a cheaper night; the difference is owed. '
  'guest_request: the guest asked for a refund from the ticket page.';
