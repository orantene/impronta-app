-- 20260615200003_rls_initplan_optimize rewrites ~120 policies to wrap
-- auth.uid() in a scalar subselect. Six of them are on
-- public.coordinator_join_requests, and from scratch it aborts with
--     ERROR:  relation "public.coordinator_join_requests" does not exist
--
-- THE TABLE EXISTED WHEN THIS RAN, AND WAS DELETED LATER
--   20260513201434_coordinator_join_requests.sql creates it and
--   20261027000002_drop_coordinator_join_requests.sql drops it. In version
--   order the create comes first, so this migration should be fine — except
--   that this migration is DEFERRED (it also needs objects that later files
--   create), and by the time the deferral retries it, 20261027000002 has
--   already run and taken the table away. Production applied it in the window
--   between the two, which a version-ordered replay does not have.
--
-- WHAT THIS PAIR OF SHIMS DOES
--   .pre  recreates the table — DDL copied verbatim from 20260513201434 — so
--         the six CREATE POLICY statements have something to attach to.
--   .post drops it again, but ONLY when 20261027000002 is already recorded as
--         applied. That condition is the whole point: if this migration lands
--         in its natural window (before the drop) the pre-shim is a no-op and
--         the post-shim leaves the real table alone; if it lands after, the
--         table is CI scaffolding and must go, because production does not
--         have it.
--   Either way the final schema is production's: no coordinator_join_requests,
--   and no trace of its policies.
create table if not exists public.coordinator_join_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  inquiry_id uuid not null references public.inquiries(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  pitch text,
  state text not null default 'pending'
    check (state in (
      'pending',
      'approved',
      'declined',
      'cancelled_by_requester',
      'revoked_after_approval'
    )),
  decided_by_user_id uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coord_request_decision_consistency check (
    case
      when state in ('approved', 'declined', 'revoked_after_approval')
        then decided_by_user_id is not null and decided_at is not null
      else true
    end
  )
);

-- The same migration also rewrites the policies that call
-- public.coord_request_can_approve(uuid, uuid). That function is created by
-- 20260513201434 alongside the table, and dropped with it by
-- 20261027000002_drop_coordinator_join_requests, so a deferred retry meets
--     ERROR:  function coord_request_can_approve(uuid, uuid) does not exist
-- Definition copied verbatim from 20260513201434 lines 87-135.
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

  select exists(
    select 1 from public.agency_memberships
    where tenant_id = v_tenant_id
      and profile_id = p_user_id
      and status = 'active'
      and role in ('admin', 'owner')
  ) into v_is_staff;
  if v_is_staff then return true; end if;

  select exists(
    select 1 from public.inquiry_participants
    where inquiry_id = p_inquiry_id
      and user_id = p_user_id
      and role = 'coordinator'
      and status in ('active', 'invited')
  ) into v_is_coord;
  if v_is_coord then return true; end if;

  v_is_client := (v_client_user is not null and v_client_user = p_user_id);
  return v_is_client;
end;
$$;
