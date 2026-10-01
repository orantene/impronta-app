-- Template Factory goal #6: one-command demo rebuild. Backup + audit row per
-- rebuilt demo (service role only; written by rebuildDemos / restoreDemoRun).
create table if not exists public.demo_rebuild_runs (
  id uuid primary key default gen_random_uuid(),
  design text not null,
  profile_code text not null,
  talent_profile_id uuid,
  before jsonb not null,
  after_hash text,
  status text not null check (status in ('wrote', 'failed', 'restored')),
  error text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.demo_rebuild_runs enable row level security;
revoke all on public.demo_rebuild_runs from anon, authenticated;

create index if not exists demo_rebuild_runs_code_created_idx
  on public.demo_rebuild_runs (profile_code, created_at desc);
