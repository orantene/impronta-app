-- QA host pool: reserve qa-1 .. qa-6.tulala.digital as platform 'app' hosts so
-- the proxy host gate renders them, and reserve the labels so no talent site
-- slug can claim them. Hosts are leased at runtime by web/scripts/qa-host.mjs
-- (a Vercel alias is the lease). These hosts use the PRODUCTION database.
-- Idempotent.

insert into public.agency_domains
  (tenant_id, hostname, kind, is_primary, status, verified_at, ssl_provisioned_at)
select null, 'qa-' || n || '.tulala.digital', 'app', false, 'active', now(), now()
from generate_series(1, 6) as n
on conflict (hostname) do nothing;

-- Same body as 20261231280000 plus one rule: the qa-1..qa-6 pool labels are
-- reserved. Grants are re-asserted exactly as 20261231281000 left them.
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

  -- QA host pool labels (qa-1 .. qa-6).
  if v_label ~ '^qa-[1-6]$' then
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

  return false;
end;
$function$;

revoke all on function public.platform_subdomain_label_taken(text, uuid, uuid)
  from public, anon;
grant execute on function public.platform_subdomain_label_taken(text, uuid, uuid)
  to authenticated, service_role;
