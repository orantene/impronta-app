-- Talent custom-domain acquisition tracking (Web Office domain purchase).
-- Adds how the domain was obtained + Stripe/Vercel order identifiers so the
-- buy webhook can attach idempotently after Checkout payment.

alter table public.talent_site_domains
  add column if not exists acquisition text
    check (acquisition is null or acquisition in ('connected', 'purchased', 'assisted')),
  add column if not exists stripe_checkout_session_id text,
  add column if not exists vercel_order_id text,
  add column if not exists registrant_email text;

-- One Stripe Checkout session maps to at most one talent domain row.
create unique index if not exists talent_site_domains_stripe_checkout_session_id_key
  on public.talent_site_domains (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on column public.talent_site_domains.acquisition is
  'How the domain was obtained: connected (DIY DNS), purchased (Vercel Registrar via Stripe), assisted (support).';
comment on column public.talent_site_domains.stripe_checkout_session_id is
  'Stripe Checkout session id for a purchased domain; unique when set (webhook idempotency).';
comment on column public.talent_site_domains.vercel_order_id is
  'Vercel Domains Registrar order id returned by POST /v1/registrar/domains/{domain}/buy.';
comment on column public.talent_site_domains.registrant_email is
  'Registrant contact email used at purchase time (or assisted setup).';
