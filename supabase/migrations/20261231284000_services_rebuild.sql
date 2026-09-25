-- Services rebuild: Hidden vs Draft, category order, selling defaults,
-- shared extras, and a 30-day category rename log.

alter table public.talent_offerings
  add column if not exists first_published_at timestamptz;

update public.talent_offerings
set first_published_at = coalesce(updated_at, created_at, now())
where status = 'published'
  and first_published_at is null;

create or replace function public.talent_offerings_stamp_first_published()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.first_published_at is null then
    new.first_published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists talent_offerings_stamp_first_published on public.talent_offerings;
create trigger talent_offerings_stamp_first_published
  before insert or update of status on public.talent_offerings
  for each row
  execute function public.talent_offerings_stamp_first_published();

alter table public.talent_profiles
  add column if not exists category_order text[] not null default '{}'::text[];

alter table public.talent_profiles
  add column if not exists selling_defaults jsonb not null default '{}'::jsonb;

alter table public.talent_profiles
  add column if not exists category_rename_log jsonb not null default '[]'::jsonb;

create table if not exists public.talent_addon_groups (
  id uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null references public.talent_profiles(id) on delete cascade,
  name text not null,
  amount_cents integer not null default 0,
  duration_minutes integer,
  media_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_addon_groups_talent_idx
  on public.talent_addon_groups (talent_profile_id);

create table if not exists public.talent_addon_group_attachments (
  addon_group_id uuid not null references public.talent_addon_groups(id) on delete cascade,
  offering_id uuid not null references public.talent_offerings(id) on delete cascade,
  primary key (addon_group_id, offering_id)
);

create index if not exists talent_addon_group_attachments_offering_idx
  on public.talent_addon_group_attachments (offering_id);

alter table public.talent_offering_addons
  add column if not exists addon_group_id uuid references public.talent_addon_groups(id) on delete set null;

alter table public.talent_offering_addons
  add column if not exists duration_minutes integer;

alter table public.talent_offering_addons
  add column if not exists media_asset_id uuid;
