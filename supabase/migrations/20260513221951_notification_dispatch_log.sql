-- Phase D+ scaffold — notification dispatch log.
-- Tracks every notification sent (which event, to whom, via which
-- channel). Items 29 (rules matrix) + 30 (WhatsApp/SMS) ship in
-- future sessions; this is the durable record they both write to.

BEGIN;

create table if not exists public.notification_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.agencies(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null
    check (event_kind in (
      'client_message','talent_response','talent_rate_submitted',
      'offer_sent','offer_approved','offer_countered','offer_declined',
      'payment_completed','payment_failed',
      'coord_request_submitted','coord_request_approved',
      'call_sheet_updated','booking_today',
      'talent_unresponsive','client_unresponsive'
    )),
  channel text not null
    check (channel in ('in_app','email','sms','whatsapp','push')),
  status text not null default 'queued'
    check (status in ('queued','sent','failed','suppressed')),
  payload jsonb not null default '{}'::jsonb,
  provider_reference text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists ndl_recipient_recent_idx
  on public.notification_dispatch_log (recipient_user_id, created_at desc);

create index if not exists ndl_event_idx
  on public.notification_dispatch_log (event_kind, status, created_at desc);

alter table public.notification_dispatch_log enable row level security;

-- Self-read only (the recipient sees their own dispatch history).
-- Writes are SECURITY DEFINER from the future dispatcher RPC.
drop policy if exists ndl_select_self on public.notification_dispatch_log;
create policy ndl_select_self on public.notification_dispatch_log
  for select using (recipient_user_id = auth.uid());

comment on table public.notification_dispatch_log is
  'Durable log of notifications fanned out by the dispatcher. Items 29 (rules matrix) + 30 (WhatsApp/SMS) both write here.';

COMMIT;
