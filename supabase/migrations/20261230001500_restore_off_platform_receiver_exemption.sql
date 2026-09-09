-- ============================================================================
-- Restore the off-platform payout-receiver exemption phase 8 reverted
-- ============================================================================
--
-- WHAT BROKE. `20260714161746_off_platform_settlement_rail_aware.sql` made the
-- payout-receiver requirement RAIL-AWARE, and its comment states the reasoning
-- exactly: on-platform (Stripe) money routes to a connected account and needs a
-- receiver; off-platform money (`provider = 'manual'` — cash, wire, venue_paid,
-- crypto, other) routes nothing and needs none.
--
-- `20260906100000_phase_8_corrective_hardening.sql` then re-created the same
-- function to widen the transition graph, and in doing so re-emitted the
-- receiver rule WITHOUT the `provider IS DISTINCT FROM 'manual'` clause. It was
-- not an argued reversal — the migration's own comment says its purpose was to
-- add missing transitions. The exemption was collateral, and being a
-- CREATE OR REPLACE of a whole body, nothing flagged the loss.
--
-- WHAT THAT COSTS. `payout_receiver_id` is a *payout destination*: a row in
-- `payout_accounts`, normally a connected Stripe account. Cash handed across a
-- counter has no payout destination, because the money is already in the
-- operator's drawer and the platform will never move it. Requiring one before
-- `status` may become `paid` therefore makes off-platform money unrecordable:
-- `settleAtDoor` — POS cash and the event door — could not mark a settlement
-- paid, so a cashier could take an $18 note and the order stayed unpaid with
-- the full amount outstanding. On the isolated QA workspace there are zero
-- `payout_accounts` rows, which is the normal state for a venue that only ever
-- takes cash, so there was not even a wrong answer available to supply.
--
-- This restores the clause on top of phase 8's transition graph rather than
-- reverting to the older body, so both intents survive: the wider graph phase 8
-- wanted, and the rail-awareness 20260714161746 argued for.
--
-- `IS DISTINCT FROM` rather than `<>` is deliberate and inherited: a NULL
-- provider stays on the receiver-REQUIRED side, so an unknown rail fails
-- closed.

BEGIN;

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

  -- RAIL-AWARE receiver requirement. This is the clause phase 8 dropped.
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

  -- Always set the timestamp on entry into a state. For retries (e.g.
  -- failed → payment_requested → failed) we OVERWRITE so the audit trail
  -- captures the latest entry into that state — fixes audit finding M11.
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

COMMIT;
