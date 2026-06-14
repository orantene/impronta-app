-- Deposits (feature 6.3) — allow a deposit + balance charge to coexist.
--
-- idx_booking_transactions_booking_active enforces "at most one active
-- transaction per booking" by excluding only cancelled/failed/refunded. That
-- breaks the deposit→balance flow: once the DEPOSIT charge settles ('paid'),
-- it still occupies the active slot, so the BALANCE charge can't be created
-- ("duplicate key ... idx_booking_transactions_booking_active").
--
-- A settled deposit is terminal for its own charge — the booking still needs
-- the balance charge. Exclude paid/paid-out DEPOSIT transactions from the
-- active set so exactly one balance/full transaction can follow. A deposit
-- still in flight (draft/payment_requested/pending) keeps the slot, which
-- correctly forces "pay the deposit before requesting the balance".

DROP INDEX IF EXISTS public.idx_booking_transactions_booking_active;

CREATE UNIQUE INDEX idx_booking_transactions_booking_active
  ON public.booking_transactions USING btree (booking_id)
  WHERE (
    status <> ALL (ARRAY['cancelled'::text, 'failed'::text, 'refunded'::text])
    AND NOT (
      checkout_type = 'deposit'
      AND status = ANY (ARRAY['paid'::text, 'payout_pending'::text, 'payout_sent'::text, 'payout'::text])
    )
  );
