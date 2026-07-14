-- Off-platform settlement: make the receiver requirement RAIL-AWARE.
--
-- Payments settle on one of two rails, marked by booking_transactions.provider:
--   • 'stripe' (ON-platform)  — funds route through the platform to a connected
--                               payout account, so a payout_receiver_id IS required.
--   • 'manual' (OFF-platform) — cash / efectivo / wire / venue_paid / crypto. The
--                               client pays the agency or talent DIRECTLY; the
--                               platform routes NOTHING, so NO payout receiver is
--                               meaningful. The commission split is still recorded
--                               and the platform fee / talent net accrue to the
--                               workspace off-platform balance ledger.
--
-- BUG (E2): validate_booking_transaction_status_transition() required a
-- payout_receiver_id for EVERY advancing status regardless of rail, so a
-- cash-only workspace with no connected Stripe account literally could not mark a
-- cash booking paid. This makes the receiver requirement apply to on-platform
-- (provider <> 'manual') transactions only. Off-platform transactions advance
-- draft -> payment_requested -> paid with no receiver. Everything else about the
-- trigger (transition legality, timestamp stamping, refund guards) is preserved
-- byte-for-byte from 20260906100000_phase_8_corrective_hardening.sql.

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

  -- RAIL-AWARE receiver requirement: on-platform (Stripe) payouts route to a
  -- connected account and require a receiver; off-platform (manual: cash / wire /
  -- venue_paid / crypto / other) route nothing and require none. IS DISTINCT FROM
  -- keeps a NULL provider on the safe (receiver-required) side.
  IF NEW.status IN ('payment_requested', 'pending', 'paid', 'payout_pending', 'payout_sent')
     AND NEW.payout_receiver_id IS NULL
     AND NEW.provider IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION
      'booking_transactions: payout_receiver_id is required before moving to status % (on-platform only)',
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
  ELSIF OLD.status = 'disputed' AND NEW.status IN ('paid', 'refunded', 'failed') THEN
    NULL;
  ELSE
    RAISE EXCEPTION
      'booking_transactions: invalid status transition from % to %',
      OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'payment_requested' THEN
    NEW.requested_at := now();
    NEW.failed_at := NULL;
  ELSIF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  ELSIF NEW.status = 'payout_pending' AND NEW.payout_initiated_at IS NULL THEN
    NEW.payout_initiated_at := now();
  ELSIF NEW.status = 'payout_sent' AND NEW.payout_completed_at IS NULL THEN
    NEW.payout_completed_at := now();
  ELSIF NEW.status = 'refunded' AND NEW.refunded_at IS NULL THEN
    NEW.refunded_at := now();
  ELSIF NEW.status = 'failed' THEN
    NEW.failed_at := now();
  ELSIF NEW.status = 'disputed' AND NEW.disputed_at IS NULL THEN
    NEW.disputed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already bound to this function (BEFORE INSERT OR UPDATE) in the phase-8
-- migration; CREATE OR REPLACE keeps the binding. No trigger re-creation needed.
