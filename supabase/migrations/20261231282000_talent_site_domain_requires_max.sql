-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — a CUSTOM DOMAIN requires Web Office.
--
-- The free personal website serves on the talent's Tulala subdomain. A custom
-- domain is one of the paid (Web Office / `talent_portfolio`) benefits, so when
-- a Web Office subscription lapses the custom domain must stop resolving while
-- the subdomain keeps serving.
--
-- `talent_site_domain_lookup(p_host)` is the ONLY read path that turns a custom
-- host into a talent site (`lib/saas/host-context.ts` calls it through the
-- public anon client). Adding the plan predicate here means the lapse is
-- enforced at the data layer: no row is mutated, no domain is deleted, and the
-- instant the plan is restored the same row resolves again.
--
-- `talent_profile_has_max(uuid)` already exists (20261001000000_talent_sites.sql)
-- and is the same helper the `talent_site_domains` RLS policies use, so the
-- app-layer gate (`personalSiteCustomDomain`) and the DB agree by construction.
--
-- IDEMPOTENT: `create or replace function` with the identical signature. Purely
-- additive — no table, column or row is touched, and re-running is a no-op.
-- REVERSIBLE: re-apply the body from 20261030000000_talent_max_site.sql without
-- the `talent_profile_has_max` predicate.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create or replace function public.talent_site_domain_lookup(p_host text)
  returns table (
    talent_profile_id uuid,
    site_slug text,
    domain text
  )
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select
    d.talent_profile_id,
    ts.site_slug,
    d.domain
  from public.talent_site_domains d
  inner join public.talent_profiles tp on tp.id = d.talent_profile_id
  inner join public.talent_sites ts on ts.talent_profile_id = d.talent_profile_id
  where lower(d.domain) = lower(p_host)
    and d.status = 'active'
    and tp.is_publicly_hidden = false
    and ts.site_published_at is not null
    and public.talent_profile_has_max(d.talent_profile_id);
$function$;

comment on function public.talent_site_domain_lookup(text) is
  'Resolve a CUSTOM host to a talent site. Requires an active domain row, a publicly visible profile, a published site, AND a current Web Office (talent_portfolio) plan — a lapsed plan stops the custom domain resolving while the Tulala subdomain keeps serving. Rows are never mutated, so restoring the plan restores the domain.';

-- `create or replace` preserves existing grants; re-stated so a fresh database
-- built from these migrations ends in the same state as production.
grant execute on function public.talent_site_domain_lookup(text) to anon, authenticated;

commit;
