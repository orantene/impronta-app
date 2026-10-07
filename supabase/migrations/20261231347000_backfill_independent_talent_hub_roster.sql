-- TUL-157 · backfill: every non-deleted talent with NO active roster row gets an
-- ACTIVE row on the platform hub (tulala.digital), the default home for
-- independent talents. Without a roster row requireTalentSelfAction resolves
-- tenantId = null (media, hero text, services, skills, taxonomy all fail).
--
-- Safety argument:
--   * INSERT only. No UPDATE, no DELETE, no schema change. Existing roster rows
--     are never touched (Jorgelina TAL-93938 and TAL-93900 already hold active
--     rows, so the NOT EXISTS guard skips them).
--   * Guard: skipped for any talent that already has an active row on ANY tenant.
--   * Idempotent: ON CONFLICT DO NOTHING (live unique key tenant+talent) and the
--     guard means a re-run inserts nothing.
--   * The hub is resolved by kind='hub' + plan_tier='network' + status='active'
--     (oldest first), the same predicate as getPlatformHubTenant() and the
--     ensure_talent_in_platform_hub() trigger. No hard-coded id. If no hub
--     exists the cross join yields zero rows and nothing is written.
--   * Mirrors the app helper (ensure-hub-roster.server.ts): source_type
--     freelancer_claimed, site_visible, is_primary false.

insert into public.agency_talent_roster
  (tenant_id, talent_profile_id, source_type, status, agency_visibility,
   hub_visibility_status, is_primary, source_workspace_id)
select h.id, tp.id, 'freelancer_claimed', 'active', 'site_visible',
       'not_submitted', false, h.id
from public.talent_profiles tp
cross join lateral (
  select a.id
  from public.agencies a
  where a.kind = 'hub' and a.plan_tier = 'network' and a.status = 'active'
  order by a.created_at asc
  limit 1
) h
where tp.deleted_at is null
  and not exists (
    select 1 from public.agency_talent_roster r
    where r.talent_profile_id = tp.id
      and r.status = 'active'
  )
on conflict do nothing;
