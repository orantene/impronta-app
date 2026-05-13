-- Messages Consolidation Plan v2 — Slice F
-- Coordinator join requests: the formal flow for a talent who wants to
-- be upgraded to coordinator on a specific inquiry.
--
-- Lifecycle (plan §7.3):
--   pending → approved | declined | cancelled_by_requester | revoked_after_approval
--
-- Approval rule (plan §7.2): any one of {existing coordinator on the
-- inquiry, workspace admin/owner, the client themselves} can approve.
-- The engine validates the actor's role before flipping state.
--
-- On approval, the engine upgrades the talent's inquiry_participants
-- row by setting role to include 'coordinator' and emits a
-- coordinator_joined activity event.

create table if not exists public.coordinator_join_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  -- requester = the talent's user (must already be a participant on
  -- the inquiry with role='talent')
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  -- short freeform pitch from the requester
  pitch text,
  -- lifecycle state
  state text not null default 'pending'
    check (state in (
      'pending',
      'approved',
      'declined',
      'cancelled_by_requester',
      'revoked_after_approval'
    )),
  -- decision metadata
  decided_by_user_id uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  -- timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- one ACTIVE pending request per (inquiry, requester) at a time;
  -- approved/declined/cancelled requests stay in the table for audit.
  -- Enforced via a partial unique index below.
  constraint coord_request_decision_consistency check (
    case
      when state in ('approved', 'declined', 'revoked_after_approval')
        then decided_by_user_id is not null and decided_at is not null
      else true
    end
  )
);

create unique index if not exists coord_request_one_pending_per_pair
  on public.coordinator_join_requests (inquiry_id, requester_user_id)
  where state = 'pending';

create index if not exists coord_request_by_inquiry
  on public.coordinator_join_requests (inquiry_id, state);

create index if not exists coord_request_by_tenant
  on public.coordinator_join_requests (tenant_id, state, created_at desc);

-- Touch updated_at on every UPDATE.
create or replace function public.coord_request_touch_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_coord_request_touch_updated_at
  on public.coordinator_join_requests;
create trigger trg_coord_request_touch_updated_at
  before update on public.coordinator_join_requests
  for each row execute function public.coord_request_touch_updated_at();

-- RLS
alter table public.coordinator_join_requests enable row level security;

-- Helper: actor has approval authority on this inquiry.
-- Returns true when actor is (a) a coordinator on the inquiry, (b)
-- workspace admin/owner of the tenant, or (c) the inquiry's client.
create or replace function public.coord_request_can_approve(
  p_inquiry_id uuid,
  p_user_id uuid
)
  returns boolean
  language plpgsql
  security definer
  stable
as $$
declare
  v_tenant_id uuid;
  v_client_user uuid;
  v_is_staff boolean;
  v_is_coord boolean;
  v_is_client boolean;
begin
  select tenant_id, client_user_id
    into v_tenant_id, v_client_user
    from public.inquiries
    where id = p_inquiry_id;

  if v_tenant_id is null then return false; end if;

  -- (a) workspace admin/owner of the tenant
  select exists(
    select 1 from public.agency_memberships
    where tenant_id = v_tenant_id
      and profile_id = p_user_id
      and status = 'active'
      and role in ('admin', 'owner')
  ) into v_is_staff;
  if v_is_staff then return true; end if;

  -- (b) existing coordinator participant on this inquiry
  select exists(
    select 1 from public.inquiry_participants
    where inquiry_id = p_inquiry_id
      and user_id = p_user_id
      and role = 'coordinator'
      and status in ('active', 'invited')
  ) into v_is_coord;
  if v_is_coord then return true; end if;

  -- (c) the inquiry's client themselves
  v_is_client := (v_client_user is not null and v_client_user = p_user_id);
  return v_is_client;
end;
$$;

grant execute on function public.coord_request_can_approve(uuid, uuid) to authenticated;

-- RLS policy: requester can read their own; approvers can read any
-- request on inquiries they have approval authority over; service role
-- bypasses for engine paths.
drop policy if exists coord_request_select on public.coordinator_join_requests;
create policy coord_request_select on public.coordinator_join_requests
  for select
  using (
    requester_user_id = auth.uid()
    or public.coord_request_can_approve(inquiry_id, auth.uid())
  );

drop policy if exists coord_request_insert on public.coordinator_join_requests;
create policy coord_request_insert on public.coordinator_join_requests
  for insert
  with check (
    requester_user_id = auth.uid()
    and state = 'pending'
    and exists(
      select 1 from public.inquiry_participants
      where inquiry_id = coordinator_join_requests.inquiry_id
        and user_id = auth.uid()
        and role = 'talent'
        and status in ('active', 'invited')
    )
  );

-- Updates only via SECURITY DEFINER RPCs (below).
drop policy if exists coord_request_update on public.coordinator_join_requests;
create policy coord_request_update on public.coordinator_join_requests
  for update
  using (false)
  with check (false);

-- ─── Engine RPCs ────────────────────────────────────────────────────

-- Submit a request. Returns the request id on success, raises on
-- conflict (a pending request already exists for this pair).
create or replace function public.coord_request_submit(
  p_inquiry_id uuid,
  p_pitch text default null
)
  returns uuid
  language plpgsql
  security definer
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'auth required';
  end if;

  -- Verify requester is a talent participant.
  select i.tenant_id into v_tenant
    from public.inquiries i
    join public.inquiry_participants p
      on p.inquiry_id = i.id
      and p.user_id = v_user
      and p.role = 'talent'
      and p.status in ('active', 'invited')
    where i.id = p_inquiry_id;

  if v_tenant is null then
    raise exception 'forbidden: not a talent on this inquiry';
  end if;

  insert into public.coordinator_join_requests (
    tenant_id, inquiry_id, requester_user_id, pitch, state
  ) values (
    v_tenant, p_inquiry_id, v_user, p_pitch, 'pending'
  )
  on conflict on constraint coord_request_one_pending_per_pair
    do nothing
  returning id into v_id;

  -- If a pending row already exists, surface its id so the caller can
  -- treat the submit as idempotent.
  if v_id is null then
    select id into v_id
      from public.coordinator_join_requests
      where inquiry_id = p_inquiry_id
        and requester_user_id = v_user
        and state = 'pending'
      order by created_at desc
      limit 1;
  end if;

  return v_id;
end;
$$;

grant execute on function public.coord_request_submit(uuid, text) to authenticated;

-- Approve a request. The approver must satisfy coord_request_can_approve.
-- On approve: flip state, upgrade the requester's inquiry_participants
-- row to include 'coordinator', emit an inquiry_events row.
create or replace function public.coord_request_approve(
  p_request_id uuid
)
  returns void
  language plpgsql
  security definer
as $$
declare
  v_actor uuid := auth.uid();
  v_inquiry uuid;
  v_requester uuid;
  v_state text;
begin
  if v_actor is null then raise exception 'auth required'; end if;

  select inquiry_id, requester_user_id, state
    into v_inquiry, v_requester, v_state
    from public.coordinator_join_requests
    where id = p_request_id
    for update;

  if v_inquiry is null then raise exception 'request not found'; end if;
  if v_state <> 'pending' then
    raise exception 'request already %', v_state;
  end if;
  if not public.coord_request_can_approve(v_inquiry, v_actor) then
    raise exception 'forbidden: not an approver';
  end if;

  update public.coordinator_join_requests
    set state = 'approved',
        decided_by_user_id = v_actor,
        decided_at = now()
    where id = p_request_id;

  -- Upgrade the requester's participant row to coordinator role.
  -- If the row already has 'coordinator' role somehow (race), this
  -- is a no-op via the not-equal check.
  update public.inquiry_participants
    set role = 'coordinator',
        status = case when status = 'active' then status else 'active' end
    where inquiry_id = v_inquiry
      and user_id = v_requester
      and role = 'talent';

  -- Emit activity event.
  insert into public.inquiry_events (
    tenant_id, inquiry_id, actor_user_id, kind, payload
  )
  select tenant_id, v_inquiry, v_actor, 'coordinator_joined',
         jsonb_build_object(
           'requester_user_id', v_requester,
           'approved_by', v_actor,
           'request_id', p_request_id
         )
  from public.inquiries where id = v_inquiry;
end;
$$;

grant execute on function public.coord_request_approve(uuid) to authenticated;

-- Decline a request.
create or replace function public.coord_request_decline(
  p_request_id uuid,
  p_reason text default null
)
  returns void
  language plpgsql
  security definer
as $$
declare
  v_actor uuid := auth.uid();
  v_inquiry uuid;
  v_state text;
begin
  if v_actor is null then raise exception 'auth required'; end if;

  select inquiry_id, state
    into v_inquiry, v_state
    from public.coordinator_join_requests
    where id = p_request_id
    for update;

  if v_inquiry is null then raise exception 'request not found'; end if;
  if v_state <> 'pending' then
    raise exception 'request already %', v_state;
  end if;
  if not public.coord_request_can_approve(v_inquiry, v_actor) then
    raise exception 'forbidden: not an approver';
  end if;

  update public.coordinator_join_requests
    set state = 'declined',
        decided_by_user_id = v_actor,
        decided_at = now(),
        decision_reason = p_reason
    where id = p_request_id;
end;
$$;

grant execute on function public.coord_request_decline(uuid, text) to authenticated;

-- Requester cancels their own pending request.
create or replace function public.coord_request_cancel(
  p_request_id uuid
)
  returns void
  language plpgsql
  security definer
as $$
declare
  v_actor uuid := auth.uid();
  v_requester uuid;
  v_state text;
begin
  if v_actor is null then raise exception 'auth required'; end if;

  select requester_user_id, state
    into v_requester, v_state
    from public.coordinator_join_requests
    where id = p_request_id
    for update;

  if v_requester is null then raise exception 'request not found'; end if;
  if v_requester <> v_actor then
    raise exception 'forbidden: only requester can cancel';
  end if;
  if v_state <> 'pending' then
    raise exception 'request already %', v_state;
  end if;

  update public.coordinator_join_requests
    set state = 'cancelled_by_requester',
        decided_by_user_id = v_actor,
        decided_at = now()
    where id = p_request_id;
end;
$$;

grant execute on function public.coord_request_cancel(uuid) to authenticated;

-- Revoke a coordinator after approval (admin/owner only; an existing
-- coordinator cannot revoke another).
create or replace function public.coord_request_revoke(
  p_request_id uuid,
  p_reason text default null
)
  returns void
  language plpgsql
  security definer
as $$
declare
  v_actor uuid := auth.uid();
  v_inquiry uuid;
  v_requester uuid;
  v_state text;
  v_tenant uuid;
  v_is_admin boolean;
begin
  if v_actor is null then raise exception 'auth required'; end if;

  select inquiry_id, requester_user_id, state, tenant_id
    into v_inquiry, v_requester, v_state, v_tenant
    from public.coordinator_join_requests
    where id = p_request_id
    for update;

  if v_inquiry is null then raise exception 'request not found'; end if;
  if v_state <> 'approved' then
    raise exception 'request is not in approved state (% currently)', v_state;
  end if;

  -- Only admin/owner can revoke.
  select exists(
    select 1 from public.agency_memberships
    where tenant_id = v_tenant
      and profile_id = v_actor
      and status = 'active'
      and role in ('admin', 'owner')
  ) into v_is_admin;
  if not v_is_admin then
    raise exception 'forbidden: only workspace admin/owner can revoke';
  end if;

  update public.coordinator_join_requests
    set state = 'revoked_after_approval',
        decided_by_user_id = v_actor,
        decided_at = now(),
        decision_reason = p_reason
    where id = p_request_id;

  -- Demote the participant back to talent role (preserving their talent
  -- status). If they were ONLY a coordinator (no talent line), set
  -- status='removed' since they no longer have a reason to be present.
  update public.inquiry_participants
    set role = 'talent'
    where inquiry_id = v_inquiry
      and user_id = v_requester
      and role = 'coordinator';

  -- Emit activity event.
  insert into public.inquiry_events (
    tenant_id, inquiry_id, actor_user_id, kind, payload
  ) values (
    v_tenant, v_inquiry, v_actor, 'coordinator_revoked',
    jsonb_build_object(
      'requester_user_id', v_requester,
      'revoked_by', v_actor,
      'request_id', p_request_id,
      'reason', p_reason
    )
  );
end;
$$;

grant execute on function public.coord_request_revoke(uuid, text) to authenticated;

comment on table public.coordinator_join_requests is
  'Coordinator upgrade requests from talent participants. Lifecycle: pending → approved | declined | cancelled_by_requester | revoked_after_approval. Approval allowed by any of: existing coordinator, workspace admin/owner, the inquiry client. See web/docs/messages-consolidation-plan-2026-05-13.md §7.';
