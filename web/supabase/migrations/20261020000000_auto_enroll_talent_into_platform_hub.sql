-- Auto-enroll talents into the platform network hub (Tulala) so every
-- approved/published talent is publicly live on tulala.digital/t/<code> and
-- discoverable, with no manual roster step.
--
-- Why: the public-visibility gate (public.talent_has_public_roster) requires an
-- active, site_visible/featured roster row. Before this, a newly-created talent
-- had no hub row and silently 404'd on /t/<code> and was absent from the
-- directory until someone manually rostered them.
--
-- Design: a fail-safe AFTER trigger. Enrollment can NEVER block a
-- talent_profiles write (the body is wrapped so any error is swallowed). The
-- hub is resolved by kind='hub' + plan_tier='network' (not a hardcoded id), so
-- it tracks whatever the canonical platform hub is. Idempotent via NOT EXISTS
-- against the existing partial-unique live-roster constraint.

create or replace function public.ensure_talent_in_platform_hub()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hub_id uuid;
begin
  begin
    if new.deleted_at is not null then
      return new;
    end if;
    if new.workflow_status not in ('approved', 'published') then
      return new;
    end if;

    select a.id into hub_id
    from public.agencies a
    where a.kind = 'hub'
      and a.plan_tier = 'network'
      and a.status = 'active'
    order by a.created_at asc
    limit 1;

    if hub_id is null then
      return new;
    end if;

    if not exists (
      select 1
      from public.agency_talent_roster r
      where r.tenant_id = hub_id
        and r.talent_profile_id = new.id
        and r.status in ('pending', 'active', 'inactive')
    ) then
      insert into public.agency_talent_roster
        (tenant_id, talent_profile_id, source_type, status,
         agency_visibility, talent_site_hidden, is_primary)
      values
        (hub_id, new.id, 'platform_assigned', 'active',
         'site_visible', false, false);
    end if;
  exception when others then
    -- Fail-safe: never propagate enrollment errors to the talent write.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_talent_auto_enroll_hub on public.talent_profiles;
create trigger trg_talent_auto_enroll_hub
  after insert or update of workflow_status on public.talent_profiles
  for each row
  execute function public.ensure_talent_in_platform_hub();

-- One-time idempotent backfill for existing approved/published, non-deleted
-- talents not already on the hub.
insert into public.agency_talent_roster
  (tenant_id, talent_profile_id, source_type, status,
   agency_visibility, talent_site_hidden, is_primary)
select h.id, tp.id, 'platform_assigned', 'active', 'site_visible', false, false
from public.talent_profiles tp
cross join lateral (
  select a.id
  from public.agencies a
  where a.kind = 'hub' and a.plan_tier = 'network' and a.status = 'active'
  order by a.created_at asc
  limit 1
) h
where tp.deleted_at is null
  and tp.workflow_status in ('approved', 'published')
  and not exists (
    select 1 from public.agency_talent_roster r
    where r.tenant_id = h.id and r.talent_profile_id = tp.id
      and r.status in ('pending', 'active', 'inactive')
  );
