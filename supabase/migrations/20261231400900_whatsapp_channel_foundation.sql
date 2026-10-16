-- TUL-225 WhatsApp channel, Phase 1 PR 1 (docs/plans/whatsapp-channel-design.md sections 4.5, 5.2, 5.4).
--
-- Four tables, all written by the service role only (no anon/authenticated policy, no grant):
--   whatsapp_consents        proof that a person gave this number and agreed to these messages
--   whatsapp_suppressions    do-not-send list; checked fail-closed by the channel (design 4.4)
--   whatsapp_templates       provider-approved templates; the channel sends only status = 'approved'
--   whatsapp_message_status  delivery receipts per provider message; notification_dispatch_log stays the queue
--
-- Nothing reads or writes these yet: the channel, webhook and settings UI are later PRs.

BEGIN;

-- ─── 1. consents ────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  guest_ref text,
  audience text not null check (audience in ('talent', 'client')),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  granted_at timestamptz not null default now(),
  source text not null check (source in ('talent_settings', 'inquiry_form', 'booking_sheet', 'talent_site')),
  consent_text_version text not null,
  consent_text_snapshot text not null,
  ip_hash text,
  user_agent text,
  verified_via text not null check (verified_via in ('whatsapp_code', 'sms_code', 'checkbox')),
  revoked_at timestamptz,
  revoked_via text check (revoked_via in ('settings', 'keyword', 'number_changed', 'provider', 'erasure')),
  created_at timestamptz not null default now(),
  constraint whatsapp_consents_subject_chk check (user_id is not null or guest_ref is not null),
  constraint whatsapp_consents_revoked_pair_chk check ((revoked_at is null) = (revoked_via is null))
);

-- One open consent per account and audience: changing the number closes the old row first.
create unique index if not exists whatsapp_consents_open_user_uq
  on public.whatsapp_consents (user_id, audience)
  where revoked_at is null and user_id is not null;

create index if not exists whatsapp_consents_phone_idx
  on public.whatsapp_consents (phone_e164);

-- ─── 2. suppressions ────────────────────────────────────────────────────────
create table if not exists public.whatsapp_suppressions (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  user_id uuid references auth.users(id) on delete cascade,
  reason text not null check (reason in ('keyword', 'not_on_whatsapp', 'repeated_failure', 'blocked', 'manual', 'erasure')),
  created_at timestamptz not null default now(),
  -- A guest STOP (no user) is one row per number, not one per insert.
  constraint whatsapp_suppressions_uq unique nulls not distinct (phone_e164, user_id)
);

-- ─── 3. templates ───────────────────────────────────────────────────────────
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  locale text not null check (locale in ('es', 'en')),
  provider text not null check (provider in ('twilio', 'meta')),
  provider_template_id text not null,
  category text not null check (category in ('utility', 'authentication', 'marketing')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paused', 'disabled')),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_templates_key_uq unique (provider, template_key, locale)
);

-- ─── 4. message status ──────────────────────────────────────────────────────
create table if not exists public.whatsapp_message_status (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('twilio', 'meta')),
  provider_message_id text not null,
  dispatch_log_id uuid references public.notification_dispatch_log(id) on delete set null,
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  status text not null check (status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  status_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_message_status_msg_uq unique (provider, provider_message_id)
);

create index if not exists whatsapp_message_status_dispatch_idx
  on public.whatsapp_message_status (dispatch_log_id)
  where dispatch_log_id is not null;

-- ─── 5. access: service role only ───────────────────────────────────────────
alter table public.whatsapp_consents enable row level security;
alter table public.whatsapp_suppressions enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_message_status enable row level security;

revoke all on table public.whatsapp_consents from anon, authenticated;
revoke all on table public.whatsapp_suppressions from anon, authenticated;
revoke all on table public.whatsapp_templates from anon, authenticated;
revoke all on table public.whatsapp_message_status from anon, authenticated;

comment on table public.whatsapp_consents is
  'TUL-225: WhatsApp consent proof (number, exact text agreed, how it was verified, when revoked). Service role only.';
comment on table public.whatsapp_suppressions is
  'TUL-225: WhatsApp do-not-send list. The channel checks it fail-closed. Never auto-cleared. Service role only.';
comment on table public.whatsapp_templates is
  'TUL-225: provider-approved WhatsApp templates; only status = approved may be sent. Service role only.';
comment on table public.whatsapp_message_status is
  'TUL-225: WhatsApp delivery receipts per provider message; status only moves forward. Service role only.';

COMMIT;
