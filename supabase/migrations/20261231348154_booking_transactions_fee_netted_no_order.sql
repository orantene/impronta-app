-- TUL-154: a fee-netted booking_transaction must never carry order_id.
--
-- order_collected_cents / completeOrder credit net_amount_cents as service
-- principal when net ≤ gross. That is correct for:
--   • net = gross writers (POS cash, door, payment links) — principal = gross
--   • pass-through Checkout — principal in net, surcharge in gross surplus,
--     and platform_fee_basis_points = 0
-- It is WRONG for the fee-netted create path (transactions.create), which
-- stores net = gross − platform commission with platform_fee_basis_points > 0.
-- Attaching order_id there would under-count order collection and allow
-- overcollection of the real principal.
--
-- Distinguisher: fee-netted is the only shape with platform_fee_basis_points > 0.
-- Do not key on platform_fee_cents > 0 — pass-through stores the surcharge there
-- with bps left at 0. Fee-netted writers must snapshot bps via
-- feeNettedBasisPoints() so a 1¢ commission on a large gross cannot round to 0
-- and slip into the pass-through lane (see Codex P2 on PR #2763).

BEGIN;

ALTER TABLE public.booking_transactions
  DROP CONSTRAINT IF EXISTS booking_transactions_fee_netted_no_order;

ALTER TABLE public.booking_transactions
  ADD CONSTRAINT booking_transactions_fee_netted_no_order
  CHECK (order_id IS NULL OR platform_fee_basis_points = 0);

COMMENT ON CONSTRAINT booking_transactions_fee_netted_no_order
  ON public.booking_transactions IS
  'TUL-154: fee-netted rows (platform_fee_basis_points > 0) must not carry order_id; order collection treats net as principal.';

COMMIT;

DO $proof$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'booking_transactions_fee_netted_no_order'
       AND conrelid = 'public.booking_transactions'::regclass
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'booking_transactions_fee_netted_no_order did not land';
  END IF;
END $proof$;
