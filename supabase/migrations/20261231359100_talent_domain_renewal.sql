-- D5 (TUL-526): renewal billing for domains bought through Tulala.
-- Additive columns only. `registrar_expires_at` is the ONE expiry column the health/renewal cron (D4) and the
-- renewal billing sweep (D5) share; the renewal_* columns are D5's own state machine, one cycle per expiry.
--
-- Cycle idempotency: `renewal_cycle_expires_at` records which registrar expiry the renewal_* state refers to.
-- When the registrar moves the expiry forward (a renewal happened), the state no longer matches and the sweep
-- starts a fresh cycle.

alter table public.talent_site_domains
  add column if not exists registrar_expires_at timestamptz,
  add column if not exists registrar_auto_renew boolean,
  add column if not exists registrar_checked_at timestamptz,
  add column if not exists renewal_price_cents integer
    check (renewal_price_cents is null or renewal_price_cents > 0),
  add column if not exists renewal_state text not null default 'none'
    check (renewal_state in ('none', 'awaiting_payment', 'paid', 'unpaid_autorenew_off', 'needs_attention')),
  add column if not exists renewal_cycle_expires_at timestamptz,
  add column if not exists renewal_attempts integer not null default 0,
  add column if not exists renewal_last_attempt_at timestamptz,
  add column if not exists renewal_payment_intent_id text,
  add column if not exists renewal_checkout_session_id text,
  add column if not exists renewal_paid_at timestamptz;

-- One renewal payment maps to at most one domain row (webhook idempotency).
create unique index if not exists talent_site_domains_renewal_payment_intent_id_key
  on public.talent_site_domains (renewal_payment_intent_id)
  where renewal_payment_intent_id is not null;

-- The sweep reads purchased domains that expire soon.
create index if not exists talent_site_domains_registrar_expires_at_idx
  on public.talent_site_domains (registrar_expires_at)
  where acquisition = 'purchased' and registrar_expires_at is not null;

comment on column public.talent_site_domains.registrar_expires_at is
  'When the registrar says the domain expires. Written by the renewal sweep (and the D4 health cron); null until first read.';
comment on column public.talent_site_domains.registrar_auto_renew is
  'Registrar auto-renew flag as last read. The renewal sweep turns it OFF when a renewal is unpaid before the deadline.';
comment on column public.talent_site_domains.renewal_price_cents is
  'USD cents the registrar charges to renew (cost). The talent is charged exactly this amount, no markup.';
comment on column public.talent_site_domains.renewal_state is
  'none | awaiting_payment (pay link sent) | paid | unpaid_autorenew_off (deadline passed, auto-renew turned off) | needs_attention (ops).';
comment on column public.talent_site_domains.renewal_cycle_expires_at is
  'The registrar_expires_at value the renewal_* state refers to; a different expiry starts a new cycle.';
