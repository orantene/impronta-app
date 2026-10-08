-- TUL-453 · backfill: myself → both workspaces whose public site stayed
-- inquiry-only because the owner's talent_offerings kept the hub tenant_id
-- and agencies.settings.opening_hours was never copied.
--
-- Safety:
--   * UPDATE only. No DELETE, no DROP, no schema change.
--   * Only owner-provider workspaces: active owner membership + active roster
--     row for that owner's talent profile.
--   * Offerings move only when the workspace has none for that talent yet
--     (idempotent: a re-run moves nothing).
--   * opening_hours / appointments written only when missing / disabled.
--   * talent_booking_hours.tenant_id re-homed when it still points elsewhere.
--   * Homepage baked empty-hours copy is patched by the app path on new
--     open_studio runs; this migration covers the data half for existing rows.

-- 1) Offerings: hub → workspace for the owner-provider.
with targets as (
  select distinct
    am.tenant_id as workspace_id,
    tp.id as talent_profile_id
  from public.agency_memberships am
  join public.talent_profiles tp
    on tp.user_id = am.profile_id
   and tp.deleted_at is null
  join public.agency_talent_roster r
    on r.tenant_id = am.tenant_id
   and r.talent_profile_id = tp.id
   and r.status = 'active'
  where am.role = 'owner'
    and am.status = 'active'
    and exists (
      select 1
      from public.talent_offerings o
      where o.talent_profile_id = tp.id
        and coalesce(o.owner_kind, 'talent') = 'talent'
        and o.tenant_id is distinct from am.tenant_id
    )
    and not exists (
      select 1
      from public.talent_offerings w
      where w.talent_profile_id = tp.id
        and w.tenant_id = am.tenant_id
    )
)
update public.talent_offerings o
set tenant_id = t.workspace_id,
    updated_at = now()
from targets t
where o.talent_profile_id = t.talent_profile_id
  and coalesce(o.owner_kind, 'talent') = 'talent'
  and o.tenant_id is distinct from t.workspace_id;

-- 2) opening_hours (only when missing) + appointments enabled (only when off).
with targets as (
  select distinct
    am.tenant_id as workspace_id,
    tp.id as talent_profile_id
  from public.agency_memberships am
  join public.talent_profiles tp
    on tp.user_id = am.profile_id
   and tp.deleted_at is null
  join public.agency_talent_roster r
    on r.tenant_id = am.tenant_id
   and r.talent_profile_id = tp.id
   and r.status = 'active'
  where am.role = 'owner'
    and am.status = 'active'
),
patched as (
  select
    a.id,
    case
      when a.settings->'opening_hours' is null and h.weekly is not null
        then jsonb_set(coalesce(a.settings, '{}'::jsonb), '{opening_hours}', to_jsonb(h.weekly), true)
      else coalesce(a.settings, '{}'::jsonb)
    end as with_hours,
    h.timezone as hours_tz,
    coalesce((a.settings->'appointments'->>'enabled')::boolean, false) as appt_on
  from public.agencies a
  join targets t on t.workspace_id = a.id
  join public.talent_booking_hours h on h.talent_profile_id = t.talent_profile_id
  where h.weekly is not null
)
update public.agencies a
set settings =
  case
    when p.appt_on then p.with_hours
    else jsonb_set(
      p.with_hours,
      '{appointments}',
      coalesce(p.with_hours->'appointments', '{}'::jsonb)
        || jsonb_build_object(
             'enabled', true,
             'terminology', coalesce(p.with_hours->'appointments'->>'terminology', 'appointments'),
             'presetId', coalesce(p.with_hours->'appointments'->>'presetId', 'salon'),
             'timezone', coalesce(
               nullif(p.hours_tz, ''),
               p.with_hours->'appointments'->>'timezone',
               'UTC'
             )
           ),
      true
    )
  end
from patched p
where a.id = p.id
  and (
    a.settings->'opening_hours' is null
    or not p.appt_on
  );

-- 3) Re-home the hours row onto the workspace when it still points elsewhere.
with targets as (
  select distinct
    am.tenant_id as workspace_id,
    tp.id as talent_profile_id
  from public.agency_memberships am
  join public.talent_profiles tp
    on tp.user_id = am.profile_id
   and tp.deleted_at is null
  join public.agency_talent_roster r
    on r.tenant_id = am.tenant_id
   and r.talent_profile_id = tp.id
   and r.status = 'active'
  where am.role = 'owner'
    and am.status = 'active'
)
update public.talent_booking_hours h
set tenant_id = t.workspace_id
from targets t
where h.talent_profile_id = t.talent_profile_id
  and h.tenant_id is distinct from t.workspace_id;
