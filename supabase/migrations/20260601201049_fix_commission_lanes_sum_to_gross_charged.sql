-- Fix: commission snapshot `lanes_sum_to_gross` was stale (pre-P4).
--
-- The lanes (platform_fee + workspace_fee + talent_net) sum to the amount the
-- client is ACTUALLY charged — `gross_charged_cents` = gross_cents +
-- client_surcharge_cents — NOT the bare subtotal `gross_cents`. Since P4
-- introduced the client-surcharge split of the platform take (the client bears
-- half on top of the subtotal), every real convert with a platform take > 0
-- produced lanes that summed to gross_charged_cents and therefore VIOLATED the
-- old `= gross_cents` CHECK. `persistBookingCommissionSnapshot` swallows that
-- failure (non-fatal), so the snapshot row was silently dropped on every
-- booking — the table is empty in prod and downstream readers (Stripe transfer
-- amounts, take-rate UI) have nothing to read.
--
-- Correct invariant: platform_fee + workspace_fee + talent_net = gross_charged.
-- For pre-P4 rows (client_surcharge_cents = 0) gross_charged_cents = gross_cents,
-- so this is strictly more permissive and breaks no existing row (there are
-- none anyway). Safe, zero-blast-radius.

alter table public.booking_commission_snapshot
  drop constraint if exists lanes_sum_to_gross;

alter table public.booking_commission_snapshot
  add constraint lanes_sum_to_gross
  check (platform_fee_cents + workspace_fee_cents + talent_net_cents = gross_charged_cents);
