-- Offer commercial terms (2026-06-03) — Wave W6a.
-- Makes the deposit / balance-collection-method / refund-policy a NEGOTIATED
-- part of the OFFER. The admin/talent composer sets them (defaults from the W5
-- resolver); the client + talent SEE them; the existing dual-approval IS the
-- agreement; convert snapshots them onto the booking.
--
-- SCOPE: storage + display + snapshot ONLY. NO money is charged here. The
-- deposit amount is COMPUTED + DISPLAYED + SNAPSHOTTED; nothing in this wave
-- collects it. No change to Stripe / markPaid / transfers / refunds / the
-- engine_convert_to_booking RPC.
--
-- Plain types: web/src/lib/billing/commercial-terms-types.ts
--   BalanceCollectionMethod = 'request_in_messages' | 'pay_in_place' | 'full_upfront'
--   OfferCommercialTerms    = { depositPct, depositAmountCents, balanceMethod, refundPolicy }
--
-- Idempotent: IF NOT EXISTS columns + guarded DO blocks for the CHECKs so this
-- migration is safe to re-run.

-- ── OFFER columns ───────────────────────────────────────────────────────────
-- The negotiated terms live on the draft/sent offer. deposit_amount_cents is
-- DERIVED server-side = round(total_client_price_in_cents * deposit_pct / 100).
-- All nullable — an offer drafted before this wave simply has null terms, and
-- the display layer falls back to the W5 resolver.
alter table public.inquiry_offers
  add column if not exists deposit_pct numeric,
  add column if not exists deposit_amount_cents bigint,
  add column if not exists balance_collection_method text,
  add column if not exists refund_policy_key text;

comment on column public.inquiry_offers.deposit_pct is
  'W6a — negotiated deposit percentage (0..100) for this offer. Defaulted from the W5 commercial-terms resolver; null = not set (display falls back to resolver). Display/snapshot only — nothing charges it this wave.';
comment on column public.inquiry_offers.deposit_amount_cents is
  'W6a — DERIVED deposit amount in minor units = round(total_client_price_cents * deposit_pct / 100). Computed server-side on draft save. Display/snapshot only.';
comment on column public.inquiry_offers.balance_collection_method is
  'W6a — how the balance is collected: request_in_messages | pay_in_place | full_upfront. Negotiated on the offer; snapshotted onto the booking at convert.';
comment on column public.inquiry_offers.refund_policy_key is
  'W6a — refund policy preset for this offer: tiered | flexible | strict | manual. Negotiated on the offer; snapshotted onto the booking at convert.';

-- ── BOOKING columns ─────────────────────────────────────────────────────────
-- Snapshotted from the approved offer at convert (post-commit TS, next to the
-- commission snapshot). deposit_amount_cents / deposit_currency / deposit_paid_at
-- / deposit_payment_intent_id ALREADY exist (20260513191442) — do NOT re-add.
alter table public.agency_bookings
  add column if not exists deposit_pct numeric,
  add column if not exists balance_collection_method text,
  add column if not exists refund_policy_key text;

comment on column public.agency_bookings.deposit_pct is
  'W6a — deposit percentage snapshotted from the approved offer at convert. The agreed term; not a charge instruction.';
comment on column public.agency_bookings.balance_collection_method is
  'W6a — balance collection method snapshotted from the approved offer at convert: request_in_messages | pay_in_place | full_upfront.';
comment on column public.agency_bookings.refund_policy_key is
  'W6a — refund policy preset snapshotted from the approved offer at convert: tiered | flexible | strict | manual.';

-- ── CHECK constraints (guarded + re-runnable) ───────────────────────────────
-- Nullable columns: the CHECK allows NULL (constraint passes on null), only the
-- four/three preset keys otherwise.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inquiry_offers_balance_collection_method_check'
  ) then
    alter table public.inquiry_offers
      add constraint inquiry_offers_balance_collection_method_check
      check (balance_collection_method in ('request_in_messages', 'pay_in_place', 'full_upfront'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inquiry_offers_refund_policy_key_check'
  ) then
    alter table public.inquiry_offers
      add constraint inquiry_offers_refund_policy_key_check
      check (refund_policy_key in ('tiered', 'flexible', 'strict', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_bookings_balance_collection_method_check'
  ) then
    alter table public.agency_bookings
      add constraint agency_bookings_balance_collection_method_check
      check (balance_collection_method in ('request_in_messages', 'pay_in_place', 'full_upfront'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_bookings_refund_policy_key_check'
  ) then
    alter table public.agency_bookings
      add constraint agency_bookings_refund_policy_key_check
      check (refund_policy_key in ('tiered', 'flexible', 'strict', 'manual'));
  end if;
end $$;
