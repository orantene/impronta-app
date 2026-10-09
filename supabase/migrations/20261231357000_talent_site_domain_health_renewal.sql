-- D4 · talent_site_domains health + renewal tracking.
-- Cron `/api/cron/domain-verification` stores registrar expiry and notice
-- stamps so talents get 30/7-day renewal notices and one breakage notice
-- per outage episode. Additive only; no RLS change (service-role cron writes).

alter table public.talent_site_domains
  add column if not exists registrar_expires_at timestamptz,
  add column if not exists renewal_notice_30d_sent_at timestamptz,
  add column if not exists renewal_notice_7d_sent_at timestamptz,
  add column if not exists breakage_notified_at timestamptz;

comment on column public.talent_site_domains.registrar_expires_at is
  'Registrar expiry (Vercel GET /v5/domains/{domain}.expiresAt). Null when unknown or not bought through Vercel.';
comment on column public.talent_site_domains.renewal_notice_30d_sent_at is
  'When the 30-day renewal notice was sent for the current registrar_expires_at.';
comment on column public.talent_site_domains.renewal_notice_7d_sent_at is
  'When the 7-day renewal notice was sent for the current registrar_expires_at.';
comment on column public.talent_site_domains.breakage_notified_at is
  'When the talent was notified about the current DNS/HTTPS breakage episode; cleared on recovery.';

create index if not exists idx_talent_site_domains_registrar_expires
  on public.talent_site_domains (registrar_expires_at)
  where registrar_expires_at is not null;
