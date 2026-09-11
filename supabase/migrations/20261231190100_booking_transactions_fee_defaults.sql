-- Met on the production push of 2026-09-10.
--
-- `booking_transactions.platform_fee_basis_points` and `platform_fee_cents`
-- are NOT NULL with no default (20260901190000). The isolated QA branch had
-- been given DEFAULT 0 on both by hand, so every proof of the point of sale
-- passed while the cash writer named only one of the two. Production refused
-- the first cash-shaped insert with 23502.
--
-- The writer is fixed to name both. This makes the schema agree with what QA
-- already had, so a manual tender that carries no platform fee cannot strand
-- on a column it has no reason to know about. Additive: existing rows keep
-- their values; the CHECK constraints are untouched.
BEGIN;
ALTER TABLE public.booking_transactions
  ALTER COLUMN platform_fee_basis_points SET DEFAULT 0,
  ALTER COLUMN platform_fee_cents        SET DEFAULT 0;
COMMIT;

DO $proof$
DECLARE v_bps boolean; v_fee boolean;
BEGIN
  SELECT column_default IS NOT NULL INTO v_bps FROM information_schema.columns
   WHERE table_schema='public' AND table_name='booking_transactions' AND column_name='platform_fee_basis_points';
  SELECT column_default IS NOT NULL INTO v_fee FROM information_schema.columns
   WHERE table_schema='public' AND table_name='booking_transactions' AND column_name='platform_fee_cents';
  IF NOT (v_bps AND v_fee) THEN
    RAISE EXCEPTION 'fee defaults did not land';
  END IF;
END $proof$;
