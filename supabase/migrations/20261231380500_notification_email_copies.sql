-- Notification email copies: a platform-admin list of addresses that receive a
-- copy of chosen notification kinds (support, leads, payment issues, inbound
-- support replies). Replaces relying on the single RESEND_INBOUND_FORWARD_TO env
-- var; the env var stays only as a fallback while this table has zero rows.
--
-- Service-role only: RLS on, no policies, anon/authenticated revoked. The
-- platform admin console reads/writes through server actions that re-check
-- super_admin and use the service-role client. No rows are seeded here.

create table if not exists public.notification_email_copies (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  label text,
  kinds text[] not null default '{}',
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  constraint notification_email_copies_email_lower
    check (email = lower(email)),
  constraint notification_email_copies_email_shape
    check (email ~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$'),
  constraint notification_email_copies_kinds_allowed
    check (kinds <@ array['support_new','support_urgent','support_inbound','leads','payment_issues']::text[])
);

create unique index if not exists notification_email_copies_email_key
  on public.notification_email_copies (lower(email));

alter table public.notification_email_copies enable row level security;
revoke all on table public.notification_email_copies from anon, authenticated;

comment on table public.notification_email_copies is
  'Platform-admin list of addresses that get copies of chosen notification kinds. Service-role only.';
