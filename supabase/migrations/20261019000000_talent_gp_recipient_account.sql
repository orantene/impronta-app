-- Global Payouts (v2) recipient account id for a talent.
--
-- When a talent sets up local-bank Global Payouts, we create a v2 core account
-- (configuration.recipient) + a bank PayoutMethod, and store the recipient id
-- here. executeBookingTransfers' `global_payouts` rail pays OutboundPayments to
-- this account. Distinct from `stripe_account_id` (the Connect/Express account).
-- Additive + nullable → zero impact on existing payouts.

alter table public.talent_profiles
  add column if not exists gp_recipient_account_id text;

comment on column public.talent_profiles.gp_recipient_account_id is
  'Stripe v2 Global Payouts recipient (core) account id — target of OutboundPayments on the global_payouts rail. Distinct from stripe_account_id (Connect Express).';
