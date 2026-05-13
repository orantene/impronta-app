-- Messages Consolidation Plan v2 — Slice K
-- Talent-side Stripe Connect Express account columns on talent_profiles.
--
-- Mirrors the agencies-side schema added in 20260907150100_stripe_
-- connect_accounts.sql. Each talent has their own Connect Express
-- account; the platform initiates transfers to it when the booking
-- they're contracted for clears.

BEGIN;

alter table public.talent_profiles
  add column if not exists stripe_account_id text,
  add column if not exists stripe_account_status text default 'none'
    check (stripe_account_status in ('none','pending','enabled','restricted','disabled')),
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_account_synced_at timestamptz;

create unique index if not exists talent_profiles_stripe_account_id_uq
  on public.talent_profiles (stripe_account_id)
  where stripe_account_id is not null;

comment on column public.talent_profiles.stripe_account_id is
  'Stripe Connect Express account id for routing talent payouts on bookings. NULL = not yet onboarded. See web/src/lib/payments/stripe-connect-talent.ts.';

COMMIT;
