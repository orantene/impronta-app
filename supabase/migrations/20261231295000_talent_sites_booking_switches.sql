-- Website Settings Foundation, Step 2 PR A (report §1, §7, §8).
-- Additive only: talent-level master switches and chat config.
-- No reader yet. A talent with no talent_sites row reads as all-on
-- (the resolver defaults each switch to true when the row is absent).

alter table public.talent_sites
  add column if not exists accepting_bookings boolean not null default true,
  add column if not exists accepting_inquiries boolean not null default true,
  add column if not exists chat_enabled boolean not null default true,
  add column if not exists chat_config jsonb not null default '{}'::jsonb;

alter table public.talent_sites
  drop constraint if exists talent_sites_chat_config_is_object;
alter table public.talent_sites
  add constraint talent_sites_chat_config_is_object
  check (jsonb_typeof(chat_config) = 'object');

comment on column public.talent_sites.accepting_bookings is
  'Master restriction (report §1): false stops new bookings on the website and Tulala profile. Never affects agency-routed bookings.';
comment on column public.talent_sites.accepting_inquiries is
  'Master restriction: false hides Ask/Consultar for new inquiries. Existing threads keep working.';
comment on column public.talent_sites.chat_enabled is
  'Website chat on/off. Off => Consultar opens the inquiry form sheet.';
comment on column public.talent_sites.chat_config is
  'Chat presentation: { greeting?: string, browseServices?: boolean }.';
