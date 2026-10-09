-- D2 · Persist Vercel project-domain verification challenges for talent
-- custom domains so the Web Office drawer can show TXT/CNAME rows from
-- Vercel (not only the platform `_impronta-challenge` token).

alter table public.talent_site_domains
  add column if not exists vercel_challenges jsonb not null default '[]'::jsonb;

comment on column public.talent_site_domains.vercel_challenges is
  'Vercel project-domain verification challenges (type/domain/value/reason) from attach/verify. Empty when env is dark or Vercel reports none.';
