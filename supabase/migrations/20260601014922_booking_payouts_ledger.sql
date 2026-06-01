-- Held-payouts ledger.
--
-- Records every payout leg fanned out by executeBookingTransfers so a payout
-- that was SKIPPED because the recipient hadn't finished Stripe onboarding can
-- later be RELEASED (re-attempted) once their connected account is enabled —
-- instead of being abandoned on the platform balance with only a log line.
--
-- One row per (booking, participant, party). status:
--   transferred — Stripe transfer created (stripe_transfer_id set)
--   held        — recipient has no transfer-enabled account yet (funds on platform)
--   failed      — Stripe rejected the transfer for another reason
--   reversed    — transfer later reversed (refund/dispute) — reserved, not set here
--
-- The release path re-attempts 'held'/'failed' rows reusing the SAME Stripe
-- idempotency key (transfer_<booking>_<participant>_<party>), so a release can
-- never double-pay a leg that already went out.

create table if not exists public.booking_payouts (
  id                     uuid primary key default gen_random_uuid(),
  booking_id             uuid not null,
  transaction_id         uuid,
  participant_id         text not null,
  party                  text not null check (party in ('talent', 'workspace')),
  owning_party_type      text,
  owning_party_id        text,
  talent_profile_id      uuid,
  tenant_id              uuid,
  destination_account_id text,
  amount_cents           integer not null check (amount_cents >= 0),
  currency               text not null,
  status                 text not null check (status in ('transferred', 'held', 'failed', 'reversed')),
  stripe_transfer_id     text,
  attempts               integer not null default 0,
  last_error             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  transferred_at         timestamptz,
  constraint booking_payouts_unique_leg unique (booking_id, participant_id, party)
);

comment on table public.booking_payouts is
  'Ledger of booking payout legs (talent/workspace). Held legs are released once the recipient onboards; see lib/payments/transfers.ts.';

-- Release-lookup indexes: find a payee''s held legs when they onboard.
create index if not exists booking_payouts_talent_status_idx
  on public.booking_payouts (talent_profile_id, status);
create index if not exists booking_payouts_tenant_status_idx
  on public.booking_payouts (tenant_id, status);
-- Reconcile-cron sweep over all held legs.
create index if not exists booking_payouts_status_idx
  on public.booking_payouts (status);

-- keep updated_at fresh
create or replace function public.booking_payouts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists booking_payouts_touch on public.booking_payouts;
create trigger booking_payouts_touch
  before update on public.booking_payouts
  for each row execute function public.booking_payouts_touch_updated_at();

-- RLS: service-role only. All reads/writes go through server-side code using
-- the service-role client; no end-user policy is granted (UX reads use a
-- server action that runs with service role). Enabling RLS with no policy
-- denies anon/authenticated by default.
alter table public.booking_payouts enable row level security;
