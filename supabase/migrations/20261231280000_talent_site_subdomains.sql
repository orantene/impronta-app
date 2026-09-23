-- Talent site SUBDOMAINS — one shared label namespace + the public lookup RPC
-- =============================================================================
-- Phase 2 of the talent-website plan. `<name>.tulala.digital` becomes a talent's
-- own website, which means a talent site slug, an agency slug and an agency
-- subdomain label now all live in ONE namespace: whoever takes `acme` takes it
-- for everybody. Application code can check that, but only the database can
-- GUARANTEE it, so the namespace is enforced here by BEFORE triggers on all
-- three write paths.
--
-- WHAT THIS MIGRATION ADDS
--   1. `platform_subdomain_label_taken(label, exclude_talent, exclude_tenant)` —
--      the single predicate every writer consults. SECURITY DEFINER because it
--      reads `agencies`, `agency_domains`, `saas_subdomain_reservations` and
--      `talent_sites`, none of which a caller may read broadly. NEVER granted to
--      anon: an anonymous visitor must not be able to enumerate the namespace.
--   2. `talent_site_subdomain_lookup(slug)` — the host resolver's read, mirroring
--      the existing `talent_site_domain_lookup(host)` for custom domains. This
--      one IS granted to anon: it runs in middleware on every request to a
--      talent host, before any session exists.
--   3. A DNS-label CHECK on `talent_sites.site_slug`, added NOT VALID. Existing
--      rows are unaudited (slugs predate this constraint and may contain
--      anything `slugifySiteName` emitted). `web/scripts/audit-talent-site-slug-
--      collisions.ts` lists the offenders; the constraint can be VALIDATEd in a
--      later migration once that script reports clean.
--   4. Three BEFORE INSERT OR UPDATE triggers enforcing (1) on both sides:
--      talent_sites.site_slug, agency_domains (kind='subdomain') and
--      agencies.slug.
--
-- WHAT IT DOES NOT DO
--   No column is dropped, no row is rewritten, and no existing function is
--   replaced. Routing behaviour is gated in application code by the
--   `TALENT_SITE_SUBDOMAINS_ENABLED` env switch; this migration is only the
--   integrity floor, which is correct to have in place BEFORE the switch flips.
--
-- Idempotent: create or replace / drop trigger if exists / guarded constraint
-- add. Safe to re-run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The shared-namespace predicate.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Returns TRUE when `p_label` is unavailable to the caller, for ANY of:
--   * it is a reserved platform label (`www`, `api`, `admin`, …),
--   * an `agencies.slug` already equals it (other than the excluded tenant),
--   * a `kind='subdomain'` `agency_domains` hostname starts with it (other than
--     the excluded tenant),
--   * an UNEXPIRED `saas_subdomain_reservations` row holds it, or
--   * a `talent_sites.site_slug` equals it (other than the excluded talent).
--
-- Fails CLOSED: a null / blank / non-DNS-label input answers TRUE, so a caller
-- that forgets to validate cannot smuggle a malformed label past this.

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

comment on function public.platform_subdomain_label_taken(text, uuid, uuid) is
  'TRUE when a subdomain label is unavailable (reserved, or held by agencies.slug / a kind=subdomain agency_domains host / an unexpired saas_subdomain_reservations row / talent_sites.site_slug). NOT granted to anon on purpose: it would let an anonymous caller enumerate the namespace.';

-- Default EXECUTE is granted to PUBLIC, which includes anon. Revoke first, then
-- grant to the two roles that may ask.
revoke all on function public.platform_subdomain_label_taken(text, uuid, uuid) from public;
grant execute on function public.platform_subdomain_label_taken(text, uuid, uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Host resolution for `<slug>.tulala.digital` (mirrors talent_site_domain_lookup).
-- ─────────────────────────────────────────────────────────────────────────────
--
-- INTENTIONAL PUBLIC SURFACE — grant to anon is REQUIRED and must survive any
-- future grant-lock sweep, exactly like `talent_site_domain_lookup(text)`. The
-- middleware resolves a talent host on every anonymous request, before a session
-- exists. The row is returned only for a PUBLISHED site belonging to a visible,
-- non-deleted talent, so this exposes nothing a visitor cannot already see by
-- loading the site.

create or replace function public.talent_site_subdomain_lookup(p_slug text)
  returns table (
    talent_profile_id uuid,
    site_slug text
  )
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select
    ts.talent_profile_id,
    ts.site_slug
  from public.talent_sites ts
  inner join public.talent_profiles tp on tp.id = ts.talent_profile_id
  where ts.site_slug is not null
    and lower(ts.site_slug) = lower(trim(coalesce(p_slug, '')))
    and ts.site_published_at is not null
    and tp.is_publicly_hidden = false
    and tp.deleted_at is null
  limit 1;
$function$;

comment on function public.talent_site_subdomain_lookup(text) is
  'Resolve <label>.tulala.digital to a published talent site. INTENTIONAL PUBLIC SURFACE: anon EXECUTE is required by the middleware host resolver and must be preserved by grant-lock sweeps, same as talent_site_domain_lookup(text).';

grant execute on function public.talent_site_subdomain_lookup(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DNS-label shape on talent_sites.site_slug — NOT VALID.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A site slug is about to become a hostname label, so it must BE one. Existing
-- rows are unaudited, so the constraint is added NOT VALID: it binds every new
-- write and leaves history alone. Run
-- `web/scripts/audit-talent-site-slug-collisions.ts` and fix what it lists
-- before a later migration runs `VALIDATE CONSTRAINT`.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talent_sites'::regclass
      and conname = 'talent_sites_site_slug_dns_label'
  ) then
    alter table public.talent_sites
      add constraint talent_sites_site_slug_dns_label
      check (
        site_slug is null
        or site_slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
      )
      not valid;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Namespace triggers — enforced on BOTH sides of the shared namespace.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Each guard fires only when the label actually CHANGES, so ordinary updates
-- (publishing a site, touching updated_at, an agency renaming its display name)
-- never pay for a namespace read and can never be rejected by a collision that
-- already existed before this migration.
--
-- Every rejection raises SQLSTATE 23505 (unique_violation) so the existing
-- application mapping of "23505 → slug_taken" applies unchanged.

create or replace function public.talent_sites_subdomain_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  if new.site_slug is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.site_slug is not distinct from old.site_slug then
    return new;
  end if;

  if public.platform_subdomain_label_taken(new.site_slug, new.talent_profile_id, null) then
    raise exception 'site address "%" is already taken', new.site_slug
      using errcode = '23505';
  end if;

  return new;
end;
$function$;

drop trigger if exists talent_sites_subdomain_guard on public.talent_sites;
create trigger talent_sites_subdomain_guard
  before insert or update on public.talent_sites
  for each row
  execute function public.talent_sites_subdomain_guard();

create or replace function public.agency_domains_subdomain_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_label text;
begin
  if new.kind is distinct from 'subdomain' or new.hostname is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.hostname is not distinct from old.hostname
    and new.kind is not distinct from old.kind
  then
    return new;
  end if;

  v_label := split_part(lower(trim(new.hostname)), '.', 1);

  if public.platform_subdomain_label_taken(v_label, null, new.tenant_id) then
    raise exception 'subdomain "%" is already taken', v_label
      using errcode = '23505';
  end if;

  return new;
end;
$function$;

drop trigger if exists agency_domains_subdomain_guard on public.agency_domains;
create trigger agency_domains_subdomain_guard
  before insert or update on public.agency_domains
  for each row
  execute function public.agency_domains_subdomain_guard();

create or replace function public.agencies_slug_subdomain_guard()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  if new.slug is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  -- A workspace slug is not itself required to be a DNS label today, so a
  -- non-label slug is left to the existing application validation rather than
  -- being rejected here (the predicate fails closed on shape, which would
  -- otherwise block legacy renames such as slug tombstones).
  if new.slug !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$' then
    return new;
  end if;

  if public.platform_subdomain_label_taken(new.slug, null, new.id) then
    raise exception 'workspace address "%" is already taken', new.slug
      using errcode = '23505';
  end if;

  return new;
end;
$function$;

drop trigger if exists agencies_slug_subdomain_guard on public.agencies;
create trigger agencies_slug_subdomain_guard
  before insert or update on public.agencies
  for each row
  execute function public.agencies_slug_subdomain_guard();
