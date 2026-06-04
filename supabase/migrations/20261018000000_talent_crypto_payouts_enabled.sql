-- Talent opt-in flag for stablecoin (USDC) Global Payouts.
--
-- When TRUE *and* Global Payouts is active on the platform *and* the talent's
-- country is stablecoin-eligible, booking payouts for this talent route via the
-- v2 OutboundPayment rail (FinancialAccount → recipient) instead of the default
-- Connect transfers.create rail. See web/src/lib/payments/payout-rail-policy.ts.
--
-- Additive, NOT NULL DEFAULT false → zero impact on existing payouts (everyone
-- stays on the Connect rail until they explicitly opt in AND GP is live).

alter table public.talent_profiles
  add column if not exists crypto_payouts_enabled boolean not null default false;

comment on column public.talent_profiles.crypto_payouts_enabled is
  'Talent opted into USDC (stablecoin) Global Payouts. Gates the v2 OutboundPayment payout rail; falls back to Connect transfers when false or when GP is not active / country ineligible.';
