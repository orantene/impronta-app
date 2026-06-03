-- Platform-wide operating-currency control (singleton).
-- Lets a super-admin run the platform in ONE currency (default USD) and turn the
-- multi-currency earnings display OFF (default) — so talents see a single clean
-- USD figure instead of EUR/USD tabs. Display/operation only; no FX is performed.
create table if not exists public.platform_settings (
  id boolean primary key default true,
  operating_currency text not null default 'USD',
  multi_currency_display_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint platform_settings_singleton check (id is true)
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Readable by any authenticated user (the talent earnings layout reads the
-- operating currency). Writes go through the super-admin server action on the
-- service-role client, which bypasses RLS — so no UPDATE policy is exposed.
drop policy if exists platform_settings_read_all on public.platform_settings;
create policy platform_settings_read_all
  on public.platform_settings for select
  to authenticated
  using (true);
