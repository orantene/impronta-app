-- Phase 8.4 follow-up — refund record alignment.
--
-- Why:
-- - `refunded` state must carry a linked refund transaction id.
-- - `refund_of_transaction_id` must never self-reference.
-- - insert-time status guard must allow explicit refund-record rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_booking_transaction_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  booking_tenant_id UUID;
  booking_source_inquiry UUID;
  inquiry_tenant_id UUID;
  receiver_tenant_id UUID;
  refund_booking_id UUID;
  refund_tenant_id UUID;
BEGIN
  SELECT tenant_id, source_inquiry_id
    INTO booking_tenant_id, booking_source_inquiry
  FROM public.agency_bookings
  WHERE id = NEW.booking_id;

  IF booking_tenant_id IS NULL THEN
    RAISE EXCEPTION 'booking_transactions: booking % not found or has no tenant_id', NEW.booking_id;
  END IF;

  IF NEW.source_tenant_id <> booking_tenant_id THEN
    RAISE EXCEPTION
      'booking_transactions: source_tenant_id % does not match booking tenant_id %',
      NEW.source_tenant_id, booking_tenant_id;
  END IF;

  IF NEW.source_inquiry_id IS NOT NULL THEN
    SELECT tenant_id INTO inquiry_tenant_id
    FROM public.inquiries
    WHERE id = NEW.source_inquiry_id;

    IF inquiry_tenant_id IS NULL THEN
      RAISE EXCEPTION 'booking_transactions: source inquiry % not found', NEW.source_inquiry_id;
    END IF;

    IF inquiry_tenant_id <> NEW.source_tenant_id THEN
      RAISE EXCEPTION
        'booking_transactions: source inquiry tenant % does not match source_tenant_id %',
        inquiry_tenant_id, NEW.source_tenant_id;
    END IF;
  END IF;

  IF booking_source_inquiry IS NOT NULL
     AND NEW.source_inquiry_id IS NOT NULL
     AND booking_source_inquiry <> NEW.source_inquiry_id THEN
    RAISE EXCEPTION
      'booking_transactions: source inquiry % does not match booking.source_inquiry_id %',
      NEW.source_inquiry_id, booking_source_inquiry;
  END IF;

  IF NEW.payout_receiver_id IS NOT NULL THEN
    SELECT tenant_id INTO receiver_tenant_id
    FROM public.payout_accounts
    WHERE id = NEW.payout_receiver_id;

    IF receiver_tenant_id IS NULL THEN
      RAISE EXCEPTION 'booking_transactions: payout receiver % not found', NEW.payout_receiver_id;
    END IF;

    IF receiver_tenant_id <> NEW.source_tenant_id THEN
      RAISE EXCEPTION
        'booking_transactions: payout receiver tenant % does not match source_tenant_id %',
        receiver_tenant_id, NEW.source_tenant_id;
    END IF;
  END IF;

  IF NEW.refund_of_transaction_id IS NOT NULL THEN
    IF NEW.refund_of_transaction_id = NEW.id THEN
      RAISE EXCEPTION
        'booking_transactions: refund_of_transaction_id cannot self-reference id %',
        NEW.id;
    END IF;

    SELECT booking_id, source_tenant_id
      INTO refund_booking_id, refund_tenant_id
    FROM public.booking_transactions
    WHERE id = NEW.refund_of_transaction_id;

    IF refund_booking_id IS NULL THEN
      RAISE EXCEPTION
        'booking_transactions: linked refund base transaction % not found',
        NEW.refund_of_transaction_id;
    END IF;

    IF refund_booking_id <> NEW.booking_id THEN
      RAISE EXCEPTION
        'booking_transactions: refund record booking_id % does not match base booking_id %',
        NEW.booking_id, refund_booking_id;
    END IF;

    IF refund_tenant_id <> NEW.source_tenant_id THEN
      RAISE EXCEPTION
        'booking_transactions: refund record source_tenant_id % does not match base source_tenant_id %',
        NEW.source_tenant_id, refund_tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_booking_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'refunded' THEN
      IF NEW.refund_of_transaction_id IS NULL THEN
        RAISE EXCEPTION
          'booking_transactions: refunded insert rows must reference refund_of_transaction_id';
      END IF;
      IF NEW.refunded_at IS NULL THEN
        NEW.refunded_at := now();
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'booking_transactions: initial status must be draft';
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

  IF NEW.status = 'refunded' AND NEW.refund_of_transaction_id IS NULL THEN
    RAISE EXCEPTION
      'booking_transactions: refund_of_transaction_id is required before moving to refunded';
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
