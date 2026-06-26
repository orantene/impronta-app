-- booking_payouts.payout_rail — records which payout rail a leg was routed on
-- ("connect_transfer" | "global_payouts"). releaseHeldPayouts() uses it to avoid
-- releasing a Global Payouts held leg via the Connect rail, which would double-pay
-- the recipient once GP is enabled (latent today: prod runs the Connect rail).
-- Additive + nullable; legacy rows stay NULL and are treated as the Connect rail.
ALTER TABLE public.booking_payouts
  ADD COLUMN IF NOT EXISTS payout_rail TEXT;

COMMENT ON COLUMN public.booking_payouts.payout_rail IS
  'Payout rail the leg was routed on: connect_transfer | global_payouts. NULL = legacy/Connect. Used by releaseHeldPayouts to never release a GP leg via Connect.';
