-- Deposits / partial payment (feature 6.3).
-- The deposit COLUMNS already exist (inquiry_offers.deposit_pct/deposit_amount_cents;
-- agency_bookings.deposit_*; client_revenue_lifecycle allows 'deposit_paid'). This wires
-- the missing FLOW pieces:
--   1. booking_transactions.checkout_type — discriminates the deposit charge from the
--      balance charge from a full charge. markPaid forks on this: a 'deposit' txn flips
--      the booking to deposit_paid and does NOT fan out the talent/agency payout; the
--      'balance' (or 'full') txn flips to fully_paid and DOES pay out (payout-on-full).
--   2. agency_bookings.balance_due_at — when the remaining balance becomes due.
--   3. inquiry_messages.message_kind widened to include 'balance_due' for the client card.

alter table public.booking_transactions
  add column if not exists checkout_type text not null default 'full';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_transactions'::regclass
      and conname = 'booking_transactions_checkout_type_check'
  ) then
    alter table public.booking_transactions
      add constraint booking_transactions_checkout_type_check
      check (checkout_type in ('deposit', 'balance', 'full'));
  end if;
end $$;

comment on column public.booking_transactions.checkout_type is
  'deposit | balance | full — markPaid only fans out the payout on balance/full (deposit holds it).';

alter table public.agency_bookings
  add column if not exists balance_due_at timestamptz;

-- Widen message_kind to allow the client-facing balance-due card.
alter table public.inquiry_messages
  drop constraint if exists inquiry_messages_message_kind_check;
alter table public.inquiry_messages
  add constraint inquiry_messages_message_kind_check
  check (message_kind = any (array[
    'text', 'offer_event', 'payment_request', 'payment_paid', 'booking_confirmed',
    'talent_rate_confirmed', 'coordinator_request', 'talent_rate', 'call_sheet_update',
    'booking_status', 'system_event', 'admin_suggested_talent', 'balance_due'
  ]));
