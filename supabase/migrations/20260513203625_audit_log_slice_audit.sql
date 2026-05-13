-- Messages Consolidation Plan v2 — Slice AUDIT
-- Audit log for money/approval/coordinator-change actions.
--
-- Per plan §16, every critical action must be auditable for
-- compliance + dispute resolution. The Event tab's Activity
-- subsection renders a user-friendly view of the same data; the
-- backend table here retains full detail (who, when, before/after
-- diff) for legal/business record.
--
-- Engine + server actions emit audit rows from in-line code paths
-- as their last step. This migration creates the storage + read
-- helpers; the emit-side code lands incrementally as each surface
-- adds the call.

BEGIN;

create table if not exists public.inquiry_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null
    check (kind in (
      'offer_created',
      'offer_edited',
      'offer_sent',
      'offer_accepted',
      'offer_countered',
      'offer_declined',
      'payment_requested',
      'payment_paid',
      'payment_refunded',
      'talent_added',
      'talent_removed',
      'coordinator_added',
      'coordinator_removed',
      'commission_split_changed',
      'call_sheet_changed',
      'booking_wrapped',
      'booking_cancelled'
    )),
  -- Structured payload — the before/after diff or relevant snapshot.
  payload jsonb not null default '{}'::jsonb,
  -- Money amount in cents, when relevant. NULL for non-money events.
  amount_cents bigint,
  currency text,
  -- Reference IDs that scope the event (offer_id / line_item_id /
  -- participant_id / etc.) live inside payload to keep the table
  -- schema stable.
  created_at timestamptz not null default now()
);

create index if not exists inquiry_audit_log_by_inquiry
  on public.inquiry_audit_log (inquiry_id, created_at desc);

create index if not exists inquiry_audit_log_by_tenant_kind
  on public.inquiry_audit_log (tenant_id, kind, created_at desc);

create index if not exists inquiry_audit_log_by_actor
  on public.inquiry_audit_log (actor_user_id, created_at desc)
  where actor_user_id is not null;

-- RLS — read-only for participants on this inquiry; writes only via
-- SECURITY DEFINER engine paths (no INSERT policy = blocked).
alter table public.inquiry_audit_log enable row level security;

drop policy if exists inquiry_audit_log_select on public.inquiry_audit_log;
create policy inquiry_audit_log_select on public.inquiry_audit_log
  for select using (
    -- Workspace staff
    exists(
      select 1 from public.agency_memberships
      where tenant_id = inquiry_audit_log.tenant_id
        and profile_id = auth.uid()
        and status = 'active'
    )
    -- Inquiry participants — for client-facing surfaces. The Event-tab
    -- Activity subsection lets the participant see what happened to
    -- their inquiry. Engine paths filter internal-only kinds (e.g.
    -- commission_split_changed) at the read layer when rendering the
    -- talent/client views.
    or exists(
      select 1 from public.inquiry_participants p
      where p.inquiry_id = inquiry_audit_log.inquiry_id
        and p.user_id = auth.uid()
        and p.status in ('active','accepted','invited')
    )
  );

-- Emit helper (SECURITY DEFINER) — server-side code calls this from
-- engine actions. Keeps the audit-emit signature stable across
-- callers.
create or replace function public.inquiry_audit_emit(
  p_inquiry_id uuid,
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_amount_cents bigint default null,
  p_currency text default null
)
  returns uuid
  language plpgsql
  security definer
as $$
declare
  v_tenant uuid;
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  select tenant_id into v_tenant
    from public.inquiries where id = p_inquiry_id;
  if v_tenant is null then
    raise exception 'inquiry not found';
  end if;

  insert into public.inquiry_audit_log (
    tenant_id, inquiry_id, actor_user_id, kind, payload,
    amount_cents, currency
  ) values (
    v_tenant, p_inquiry_id, v_actor, p_kind, coalesce(p_payload, '{}'::jsonb),
    p_amount_cents, p_currency
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.inquiry_audit_emit(uuid, text, jsonb, bigint, text)
  to authenticated;

comment on table public.inquiry_audit_log is
  'Audit log for money / approval / coordinator-change events on inquiries. Plan v2 §16. Writes only via inquiry_audit_emit() SECURITY DEFINER. Reads gated by tenant staff membership OR active inquiry participation.';

COMMIT;
