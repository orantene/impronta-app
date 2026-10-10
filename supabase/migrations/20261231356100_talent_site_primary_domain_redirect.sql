-- D1 — talent primary custom-domain redirect fields on host RPCs
-- =============================================================================
-- When a talent has an ACTIVE primary custom domain, the proxy 308s
-- `<slug>.tulala.digital/*` and non-primary custom hosts (apex ↔ www) to that
-- primary. The edge resolver uses anon RPCs only (`talent_site_domains` RLS is
-- owner-only), so both host lookups must return the primary host (when active
-- + Web Office) without a second privileged read.
--
-- Additive RETURNS TABLE columns. Pre-migration clients ignore them; post-
-- migration app code degrades to "no redirect" when the fields are absent, so
-- this ships dark until the migration is applied.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Custom-domain lookup: expose is_primary + the profile's primary domain.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.talent_site_domain_lookup(text);

create function public.talent_site_domain_lookup(p_host text)
  returns table (
    talent_profile_id uuid,
    site_slug text,
    domain text,
    is_primary boolean,
    primary_domain text
  )
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select
    d.talent_profile_id,
    ts.site_slug,
    d.domain,
    d.is_primary,
    (
      select p.domain
      from public.talent_site_domains p
      where p.talent_profile_id = d.talent_profile_id
        and p.is_primary = true
        and p.status = 'active'
        and public.talent_profile_has_max(p.talent_profile_id)
      limit 1
    ) as primary_domain
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
  'Resolve a CUSTOM host to a talent site. Requires an active domain row, a publicly visible profile, a published site, AND a current Web Office (talent_portfolio) plan. Also returns is_primary + primary_domain (active primary only) so the proxy can 308 apex↔www without a privileged table read. INTENTIONAL PUBLIC SURFACE: anon EXECUTE required by the middleware host resolver.';

grant execute on function public.talent_site_domain_lookup(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Subdomain lookup: expose primary_custom_domain for subdomain → custom 308.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.talent_site_subdomain_lookup(text);

create function public.talent_site_subdomain_lookup(p_slug text)
  returns table (
    talent_profile_id uuid,
    site_slug text,
    is_demo boolean,
    primary_custom_domain text
  )
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  with label as (
    select lower(trim(coalesce(p_slug, ''))) as v
  ),
  exact as (
    select
      ts.talent_profile_id,
      ts.site_slug,
      coalesce(tp.is_demo, false) as is_demo
    from public.talent_sites ts
    inner join public.talent_profiles tp on tp.id = ts.talent_profile_id
    cross join label
    where ts.site_slug is not null
      and label.v <> ''
      and lower(ts.site_slug) = label.v
      and ts.site_published_at is not null
      and tp.is_publicly_hidden = false
      and tp.deleted_at is null
    limit 1
  ),
  demo_suffix as (
    select
      ts.talent_profile_id,
      ts.site_slug,
      true as is_demo
    from public.talent_sites ts
    inner join public.talent_profiles tp on tp.id = ts.talent_profile_id
    cross join label
    where not exists (select 1 from exact)
      and label.v like '%-demo'
      and char_length(label.v) > 5
      and lower(ts.site_slug) = left(label.v, char_length(label.v) - 5)
      and tp.is_demo = true
      and ts.site_published_at is not null
      and tp.is_publicly_hidden = false
      and tp.deleted_at is null
    limit 1
  ),
  design_alias_base as (
    select
      case
        when label.v in ('maison-v2', 'maison-v2-demo') then 'alba-nail-artist'
        when label.v in ('folio', 'folio-demo') then 'mateo-ferrer'
        when label.v in ('gridline', 'gridline-demo') then 'alex-trevino'
        else null
      end as featured_slug
    from label
  ),
  design_alias as (
    select
      ts.talent_profile_id,
      ts.site_slug,
      true as is_demo
    from public.talent_sites ts
    inner join public.talent_profiles tp on tp.id = ts.talent_profile_id
    cross join design_alias_base dab
    where not exists (select 1 from exact)
      and not exists (select 1 from demo_suffix)
      and dab.featured_slug is not null
      and lower(ts.site_slug) = dab.featured_slug
      and tp.is_demo = true
      and ts.site_published_at is not null
      and tp.is_publicly_hidden = false
      and tp.deleted_at is null
    limit 1
  ),
  base as (
    select exact.talent_profile_id, exact.site_slug, exact.is_demo from exact
    union all
    select demo_suffix.talent_profile_id, demo_suffix.site_slug, demo_suffix.is_demo from demo_suffix
    union all
    select design_alias.talent_profile_id, design_alias.site_slug, design_alias.is_demo from design_alias
    limit 1
  )
  select
    base.talent_profile_id,
    base.site_slug,
    base.is_demo,
    (
      select d.domain
      from public.talent_site_domains d
      where d.talent_profile_id = base.talent_profile_id
        and d.is_primary = true
        and d.status = 'active'
        and public.talent_profile_has_max(d.talent_profile_id)
      limit 1
    ) as primary_custom_domain
  from base;
$function$;

comment on function public.talent_site_subdomain_lookup(text) is
  'Resolve <label>.tulala.digital to a published talent site. Demo sites also resolve at <site_slug>-demo.<apex>. Finished-gallery design vanity hosts (maison-v2[-demo], folio[-demo], gridline[-demo]) resolve to each design''s featured demo. Returns primary_custom_domain (active Web Office primary only) so the proxy can 308 the subdomain to the talent''s custom domain. INTENTIONAL PUBLIC SURFACE: anon EXECUTE is required by the middleware host resolver and must be preserved by grant-lock sweeps, same as talent_site_domain_lookup(text).';

grant execute on function public.talent_site_subdomain_lookup(text) to anon, authenticated;

commit;
