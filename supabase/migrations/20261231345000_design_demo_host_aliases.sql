-- Design vanity demo hosts — `{design}-demo.<apex>` → featured talent demo
-- =============================================================================
-- Oran (2026-10-04): after the talent `-demo` host cutover (#2526),
-- `maison-v2-demo.tulala.digital` (and bare `maison-v2.tulala.digital`) 404
-- "Domain not connected" because those labels are DESIGN slugs, not
-- `talent_sites.site_slug` values. Talent demos already resolve via
-- `talent_site_subdomain_lookup` and must NOT be seeded into `agency_domains`
-- (agency_domains wins first and would mis-route them as agency hosts).
--
-- This migration registers the finished-gallery design vanity hosts by aliasing
-- them to each design's featured published demo site:
--   maison-v2[-demo] → alba-nail-artist
--   folio[-demo]     → mateo-ferrer
--   gridline[-demo]  → alex-trevino
--
-- Also reserves those labels in `platform_subdomain_label_taken` so a real
-- talent cannot claim them as a site_slug.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lookup: keep exact + {site_slug}-demo; add design vanity aliases.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.talent_site_subdomain_lookup(text);

create function public.talent_site_subdomain_lookup(p_slug text)
  returns table (
    talent_profile_id uuid,
    site_slug text,
    is_demo boolean
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
  -- Finished-gallery design vanity hosts → featured published demo site_slug.
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
  )
  select exact.talent_profile_id, exact.site_slug, exact.is_demo from exact
  union all
  select demo_suffix.talent_profile_id, demo_suffix.site_slug, demo_suffix.is_demo from demo_suffix
  union all
  select design_alias.talent_profile_id, design_alias.site_slug, design_alias.is_demo from design_alias
  limit 1;
$function$;

comment on function public.talent_site_subdomain_lookup(text) is
  'Resolve <label>.tulala.digital to a published talent site. Demo sites also resolve at <site_slug>-demo.<apex>. Finished-gallery design vanity hosts (maison-v2[-demo], folio[-demo], gridline[-demo]) resolve to each design''s featured demo. INTENTIONAL PUBLIC SURFACE: anon EXECUTE is required by the middleware host resolver and must be preserved by grant-lock sweeps, same as talent_site_domain_lookup(text).';

grant execute on function public.talent_site_subdomain_lookup(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Namespace: design vanity labels are taken (plus prior demo -demo reserve).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.platform_subdomain_label_taken(
  p_label text,
  p_exclude_talent_profile_id uuid default null,
  p_exclude_tenant_id uuid default null
)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $function$
declare
  v_label text;
  v_base text;
begin
  v_label := lower(trim(coalesce(p_label, '')));

  -- Fail closed on anything that is not a DNS label.
  if v_label = '' or v_label !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    return true;
  end if;

  -- Reserved platform labels. Brand names are deliberately ABSENT: the real
  -- brand hosts already exist as `agency_domains` / `agencies` rows, so they are
  -- covered by the checks below, and listing them here would make those very
  -- rows un-reinsertable.
  if v_label = any (array[
    'www', 'api', 'app', 'admin', 'dashboard', 'hub', 'auth', 'login', 'logout',
    'signin', 'signup', 'register', 'account', 'billing', 'checkout', 'support',
    'help', 'docs', 'status', 'mail', 'email', 'smtp', 'ftp', 'ns', 'ns1', 'ns2',
    'cdn', 'assets', 'static', 'media', 'files', 'uploads', 'img', 'images',
    'blog', 'press', 'jobs', 'careers', 'about', 'legal', 'privacy', 'terms',
    'security', 'marketing', 'directory', 'discover', 'search', 't', 'w', 'c',
    'p', 'preview', 'staging', 'stage', 'dev', 'test', 'beta', 'alpha', 'demo',
    'example', 'internal', 'platform', 'sandbox', 'edge'
  ]) then
    return true;
  end if;

  -- Finished-gallery design vanity hosts (bare + -demo public form).
  if v_label = any (array[
    'maison-v2', 'maison-v2-demo',
    'folio', 'folio-demo',
    'gridline', 'gridline-demo'
  ]) then
    return true;
  end if;

  -- An agency slug.
  if exists (
    select 1
    from public.agencies a
    where lower(a.slug) = v_label
      and (p_exclude_tenant_id is null or a.id <> p_exclude_tenant_id)
  ) then
    return true;
  end if;

  -- The FIRST label of a registered agency subdomain host.
  if exists (
    select 1
    from public.agency_domains d
    where d.kind = 'subdomain'
      and split_part(lower(d.hostname), '.', 1) = v_label
      and (p_exclude_tenant_id is null or d.tenant_id is distinct from p_exclude_tenant_id)
  ) then
    return true;
  end if;

  -- An unexpired signup reservation (expired rows are ignored, matching
  -- `isRequestedLinkTaken`'s lazy-expiry read).
  if exists (
    select 1
    from public.saas_subdomain_reservations r
    where lower(r.slug) = v_label
      and r.expires_at > now()
  ) then
    return true;
  end if;

  -- Another talent's site slug.
  if exists (
    select 1
    from public.talent_sites ts
    where lower(ts.site_slug) = v_label
      and (
        p_exclude_talent_profile_id is null
        or ts.talent_profile_id is distinct from p_exclude_talent_profile_id
      )
  ) then
    return true;
  end if;

  -- Demo public host `{site_slug}-demo` is reserved when a demo holds `site_slug`.
  if v_label like '%-demo' and char_length(v_label) > 5 then
    v_base := left(v_label, char_length(v_label) - 5);
    if exists (
      select 1
      from public.talent_sites ts
      inner join public.talent_profiles tp on tp.id = ts.talent_profile_id
      where lower(ts.site_slug) = v_base
        and tp.is_demo = true
        and (
          p_exclude_talent_profile_id is null
          or ts.talent_profile_id is distinct from p_exclude_talent_profile_id
        )
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$function$;

comment on function public.platform_subdomain_label_taken(text, uuid, uuid) is
  'TRUE when a subdomain label is unavailable (reserved, finished-gallery design vanity, or held by agencies.slug / a kind=subdomain agency_domains host / an unexpired saas_subdomain_reservations row / talent_sites.site_slug / a demo site''s {site_slug}-demo public host). NOT granted to anon on purpose: it would let an anonymous caller enumerate the namespace.';

revoke all on function public.platform_subdomain_label_taken(text, uuid, uuid) from public;
grant execute on function public.platform_subdomain_label_taken(text, uuid, uuid)
  to authenticated, service_role;
