-- Commercial terms configuration layer (2026-06-03).
-- Wave: CONFIGURATION ONLY — stores + reads commercial booking terms (deposit %,
-- refund policy preset, instant-book toggle). NO money-flow / charging / refund
-- execution here; that is a later wave. This migration only adds storage columns.
--
-- Storage contract (see web/src/lib/billing/commercial-terms-types.ts):
--   • TENANT terms     → agencies.settings jsonb under key "commercialTerms"
--                        (NO schema column — handled in app code, nothing here).
--   • TALENT terms     → talent_profiles.booking_terms jsonb (added below).
--   • PLATFORM defaults → platform_settings columns (added below).
--
-- Idempotent: every statement uses IF NOT EXISTS / guarded DO blocks so re-runs
-- are safe and the existing platform_settings singleton row is preserved.

-- TALENT per-profile booking terms (deposit %, refund policy, instant-book opt-in,
-- fixed rate). Nullable jsonb — absent = "inherit from tenant/platform".
alter table public.talent_profiles
  add column if not exists booking_terms jsonb;

comment on column public.talent_profiles.booking_terms is
  'Talent commercial booking preferences (TalentBookingTerms): depositPct, refundPolicy, instantBookOptIn, fixedRateCents. Configuration only — informs offers + public page, does not execute money flow.';

-- PLATFORM-wide commercial defaults on the singleton platform_settings row.
-- These are the base layer the resolver falls back to.
alter table public.platform_settings
  add column if not exists default_deposit_pct numeric not null default 0,
  add column if not exists default_refund_policy text not null default 'tiered',
  add column if not exists instant_book_default boolean not null default false;

-- Constrain the refund policy to the four shared preset keys. Guarded so the
-- migration is re-runnable (ADD CONSTRAINT has no IF NOT EXISTS in older PG).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'platform_settings_default_refund_policy_check'
  ) then
    alter table public.platform_settings
      add constraint platform_settings_default_refund_policy_check
      check (default_refund_policy in ('tiered', 'flexible', 'strict', 'manual'));
  end if;
end $$;
