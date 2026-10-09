-- One round trip for the admin layout's inbox/roster KPI counts.
-- =============================================================================
-- loadWorkspaceOverviewMetrics ran ten separate PostgREST requests on EVERY admin
-- page load (isolated-stack trace 2026-10-09: the layout wave made 78 fetches and
-- the studio sign-in landed in 20-38 s although each query runs in 0.3 ms). This
-- folds those ten reads into one function call.
--
-- SECURITY INVOKER, on purpose: the caller's RLS applies to every table read
-- exactly as it did when the app queried each table itself, so the numbers a
-- person sees cannot change and no new access path exists. Additive only.
-- =============================================================================

create or replace function public.workspace_overview_counts(
  p_tenant_id uuid,
  p_today date default current_date
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'roster_total', (
      select count(*) from agency_talent_roster r
      where r.tenant_id = p_tenant_id and r.status <> 'removed'
    ),
    'roster_published', (
      select count(*) from agency_talent_roster r
      where r.tenant_id = p_tenant_id and r.status = 'active'
        and exists (
          select 1 from talent_profiles tp
          where tp.id = r.talent_profile_id and tp.workflow_status = 'published'
        )
    ),
    'open_inquiries', (
      select count(*) from inquiries i
      where i.tenant_id = p_tenant_id and i.event_id is null
        and i.status in ('submitted', 'coordination', 'offer_pending', 'approved')
    ),
    'team_members', (
      select count(*) from agency_memberships m
      where m.tenant_id = p_tenant_id and m.status = 'active'
    ),
    'pending_approvals', (
      select count(*) from agency_talent_roster r
      where r.tenant_id = p_tenant_id and r.status = 'pending'
    ),
    'awaiting_client', (
      select count(*) from inquiries i
      where i.tenant_id = p_tenant_id and i.next_action_by = 'client'
    ),
    'draft_inquiries', (
      select count(*) from inquiries i
      where i.tenant_id = p_tenant_id and i.status = 'draft'
        and i.contact_email not like 'pending-%@guest.impronta'
    ),
    'unassigned_open', (
      select count(*) from inquiries i
      where i.tenant_id = p_tenant_id and i.coordinator_id is null
        and i.status in ('submitted', 'coordination', 'offer_pending')
    ),
    'agency_action', (
      select count(*) from inquiries i
      where i.tenant_id = p_tenant_id and i.coordinator_id is not null
        and i.next_action_by in ('coordinator', 'admin')
        and i.status in ('submitted', 'coordination', 'offer_pending')
    ),
    'ready_to_book', (
      select count(*) from inquiries i
      where i.tenant_id = p_tenant_id and i.status = 'approved'
    ),
    'oldest_coordinator_created_at', (
      select min(i.created_at) from inquiries i
      where i.tenant_id = p_tenant_id and i.next_action_by = 'coordinator'
        and i.status::text not in
          ('rejected', 'expired', 'booked', 'converted', 'closed', 'closed_lost', 'archived')
    ),
    'next_booking', (
      select jsonb_build_object('contact_name', b.contact_name, 'event_date', b.event_date)
      from inquiries b
      where b.tenant_id = p_tenant_id and b.status in ('booked', 'converted')
        and b.event_date >= p_today
      order by b.event_date asc
      limit 1
    )
  );
$$;

revoke all on function public.workspace_overview_counts(uuid, date) from public, anon;
grant execute on function public.workspace_overview_counts(uuid, date) to authenticated, service_role;
