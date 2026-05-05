-- Phase 8.4 follow-up — align booking transaction transition graph with
-- docs/transaction-architecture.md §5.3.
--
-- Main fix:
--   disputed → paid, refunded
-- (was disputed → refunded, failed in the initial Phase 8.4 function)

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_booking_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'booking_transactions: initial status must be draft';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('payment_requested', 'pending', 'paid', 'payout_pending', 'payout_sent')
     AND NEW.payout_receiver_id IS NULL THEN
    RAISE EXCEPTION
      'booking_transactions: payout_receiver_id is required before moving to status %',
      NEW.status;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('payment_requested', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'payment_requested' AND NEW.status IN ('pending', 'paid', 'cancelled', 'failed') THEN
    NULL;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('paid', 'failed', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'paid' AND NEW.status IN ('payout_pending', 'refunded', 'disputed') THEN
    NULL;
  ELSIF OLD.status = 'payout_pending' AND NEW.status IN ('payout_sent', 'refunded', 'failed') THEN
    NULL;
  ELSIF OLD.status = 'payout_sent' AND NEW.status IN ('refunded') THEN
    NULL;
  ELSIF OLD.status = 'failed' AND NEW.status IN ('payment_requested', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'disputed' AND NEW.status IN ('paid', 'refunded') THEN
    NULL;
  ELSE
    RAISE EXCEPTION
      'booking_transactions: invalid status transition from % to %',
      OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'payment_requested' AND NEW.requested_at IS NULL THEN
    NEW.requested_at := now();
  ELSIF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  ELSIF NEW.status = 'payout_pending' AND NEW.payout_initiated_at IS NULL THEN
    NEW.payout_initiated_at := now();
  ELSIF NEW.status = 'payout_sent' AND NEW.payout_completed_at IS NULL THEN
    NEW.payout_completed_at := now();
  ELSIF NEW.status = 'refunded' AND NEW.refunded_at IS NULL THEN
    NEW.refunded_at := now();
  ELSIF NEW.status = 'failed' AND NEW.failed_at IS NULL THEN
    NEW.failed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
