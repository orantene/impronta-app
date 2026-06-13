-- Platform-wide ACTIVE PAYOUT SYSTEM switch (2026-06-13).
-- A super-admin chooses which payout rail the whole platform runs on:
--   • 'connect'        → Stripe Connect (Express connected accounts + transfers). The
--                        restored default. Force-pins every talent payout to the
--                        Connect rail and hides Global Payouts onboarding in the UI.
--   • 'global_payouts' → Stripe v2 Global Payouts (USDC/local bank, ~90 countries).
--                        Restores today's per-talent crypto-opt-in routing exactly.
--
-- This is the reversible master switch. It deletes nothing — Global Payouts code +
-- onboarding stay installed and one click away. Default 'connect' so a missing/failed
-- read (and a fresh row) resolves to Connect.
--
-- Storage: a single TEXT column on the existing platform_settings singleton (id IS TRUE).
-- Idempotent: guarded ADD COLUMN / DO-block constraint so re-runs are safe and the
-- existing singleton row is preserved.

alter table public.platform_settings
  add column if not exists active_payout_system text not null default 'connect';

comment on column public.platform_settings.active_payout_system is
  'Platform-wide payout rail switch: ''connect'' (Stripe Connect, default) or ''global_payouts'' (Stripe v2 Global Payouts). Read by resolveTalentPayoutRail + the talent payouts UI. Reversible; deletes no GP code.';

-- Constrain to the two known rails. Guarded so the migration is re-runnable
-- (ADD CONSTRAINT has no IF NOT EXISTS in older PG).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'platform_settings_active_payout_system_check'
  ) then
    alter table public.platform_settings
      add constraint platform_settings_active_payout_system_check
      check (active_payout_system in ('connect', 'global_payouts'));
  end if;
end $$;
