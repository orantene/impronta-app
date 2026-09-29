-- Talent AI translate cache (PR 6, Migration C).
-- One row per normalised (field, from, to, text) hash: an unchanged input is
-- served from here with zero AI calls. Written and read ONLY by the server
-- action through the service-role client. RLS is ON with NO policies on
-- purpose: anon and authenticated get nothing (never add a permissive
-- policy here; see the 2026-09 anon-insert incident).

create table if not exists public.talent_translation_cache (
  hash text primary key,
  field text not null,
  from_locale text not null,
  to_locale text not null,
  source_text text not null,
  target_text text not null,
  model text,
  created_at timestamptz not null default now()
);

alter table public.talent_translation_cache enable row level security;

revoke all on table public.talent_translation_cache from anon, authenticated;

comment on table public.talent_translation_cache is
  'Service-role only cache for talent field AI translations. RLS on, no policies.';
