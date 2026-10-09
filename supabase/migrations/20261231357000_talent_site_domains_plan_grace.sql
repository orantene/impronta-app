-- WAVE 1B D6 — talent custom-domain downgrade / cancel lifecycle.
--
-- On losing Web Office: keep the domain row (serving already stops via
-- talent_site_domain_lookup + talent_profile_has_max). Stamp a 30-day grace
-- window with a restore-plan notice; after grace, detach from the Vercel
-- project. Purchased domains must not keep auto-renewing at Tulala's cost
-- (registrar auto-renew off); talent can transfer-out (auth code) or let
-- expire. Renewal charging itself is D5 (Payments) — out of scope here.
--
-- IDEMPOTENT: add column if not exists. Purely additive.
-- PM applies via db:push before merge — agents do not push.

begin;

alter table public.talent_site_domains
  add column if not exists plan_grace_started_at timestamptz,
  add column if not exists plan_grace_ends_at timestamptz,
  add column if not exists vercel_detached_at timestamptz,
  add column if not exists registrar_auto_renew_disabled_at timestamptz,
  add column if not exists grace_notice_sent_at timestamptz,
  add column if not exists disposition_notice_sent_at timestamptz,
  add column if not exists domain_disposition text
    check (
      domain_disposition is null
      or domain_disposition in ('transfer_out', 'expire', 'restored')
    );

comment on column public.talent_site_domains.plan_grace_started_at is
  'When Web Office was lost for this domain; row kept, serving already gated off.';
comment on column public.talent_site_domains.plan_grace_ends_at is
  'End of 30-day restore window; after this, cron detaches the host from Vercel.';
comment on column public.talent_site_domains.vercel_detached_at is
  'When the hostname was removed from the Vercel project after grace expired.';
comment on column public.talent_site_domains.registrar_auto_renew_disabled_at is
  'When registrar auto-renew was turned off so Tulala does not keep paying (purchased domains).';
comment on column public.talent_site_domains.grace_notice_sent_at is
  'When the restore-plan notice was dispatched for this grace window.';
comment on column public.talent_site_domains.disposition_notice_sent_at is
  'When the transfer-out / expire notice was dispatched after grace.';
comment on column public.talent_site_domains.domain_disposition is
  'Talent choice for a purchased domain after plan loss: transfer_out, expire, or restored.';

create index if not exists idx_talent_site_domains_grace_due
  on public.talent_site_domains (plan_grace_ends_at)
  where plan_grace_ends_at is not null and vercel_detached_at is null;

commit;
