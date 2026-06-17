-- Talent Max Site — DATA-MODEL FOUNDATION
-- =============================================================================
-- Evolves the existing talent-site stack into a talent-owned, multi-page
-- website ("Talent Max Site") that is SEPARATE from the /t/[code] discovery
-- profile. This migration is DATA ONLY — additive + reversible. NO public
-- routes (a sibling agent owns routing) and NO change to the /t/[code] render
-- (a sibling repoints it). Every existing column is preserved.
--
-- THE MODEL (reconciliation):
--   * `talent_sites`  = the SITE RECORD (one row per talent, UNIQUE
--     talent_profile_id, Max-gated). Today its `published_snapshot` renders at
--     /t/[code]. We ADD site-level config + shell columns (site_slug, shell_tree,
--     shell_published, logo_url, site_published_at). The legacy
--     draft_snapshot/published_snapshot columns are UNTOUCHED — they keep
--     rendering /t/[code] until the sibling repoints that path.
--   * `talent_pages` = the SITE's PAGES (already multi-page-capable via
--     talent_profile_id + slug + blocks jsonb). We ADD is_home / sort_order /
--     nav_label and a partial-unique "one home per talent" index.
--   * `talent_site_domains` = NEW custom-domain mapping (mirrors the agency
--     `agency_domains` status vocabulary). A sibling builds the Vercel/DNS flow.
--
-- HELPERS REUSED (already in the DB, defined by the talent_sites migration):
--   * is_talent_profile_owner(uuid)  — owner = talent_profiles.user_id = auth.uid()
--   * talent_profile_has_max(uuid)   — Max = talent_profiles.talent_plan_key = 'talent_portfolio'
--
-- Idempotent: add column if not exists / create table if not exists /
-- create unique index if not exists / drop policy if exists before create.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. talent_sites → the SITE record (config + shell). Additive columns only.
-- ─────────────────────────────────────────────────────────────────────────────

-- The talent's chosen site slug — globally unique; the /t/site/<slug> path key.
-- Nullable until provisioning/derivation sets it.
alter table public.talent_sites
  add column if not exists site_slug text;

-- DRAFT shell (header / footer / logo as a freeform builder-node tree).
alter table public.talent_sites
  add column if not exists shell_tree jsonb not null default '[]'::jsonb;

-- PUBLISHED shell snapshot (the live header/footer/logo). NULL until published.
alter table public.talent_sites
  add column if not exists shell_published jsonb;

-- The talent's site logo URL (rendered in the shell header).
alter table public.talent_sites
  add column if not exists logo_url text;

-- When the SITE (multi-page website) was last published. Distinct from the
-- legacy `published_at` (which times the /t/[code] PROFILE snapshot publish).
alter table public.talent_sites
  add column if not exists site_published_at timestamptz;

-- Globally-unique site slug. Partial index so the many NULL (unprovisioned)
-- rows don't collide — only set slugs are enforced unique.
create unique index if not exists talent_sites_site_slug_key
  on public.talent_sites (site_slug)
  where site_slug is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. talent_pages → the SITE's PAGES. Additive columns + one-home-per-talent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Marks the site's home page (the slug a bare /t/site/<slug> resolves to).
alter table public.talent_pages
  add column if not exists is_home boolean not null default false;

-- Nav ordering across the site's pages (ascending).
alter table public.talent_pages
  add column if not exists sort_order integer not null default 0;

-- The page's nav label; falls back to `title` when null.
alter table public.talent_pages
  add column if not exists nav_label text;

-- At most one home page per talent. Partial-unique on the truthy rows only, so
-- the many is_home=false pages never collide.
create unique index if not exists talent_pages_one_home_per_profile
  on public.talent_pages (talent_profile_id)
  where is_home = true;

-- Nav-ordering lookup (pages of one site, in order).
create index if not exists idx_talent_pages_profile_sort
  on public.talent_pages (talent_profile_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. talent_site_domains → custom-domain mapping (NEW). Mirrors agency_domains
--    status vocabulary: pending | dns_verification_sent | verified |
--    ssl_provisioned | active | error.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.talent_site_domains (
  id uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null
    references public.talent_profiles (id) on delete cascade,
  domain text not null,
  status text not null default 'pending'
    check (status in (
      'pending',
      'dns_verification_sent',
      'verified',
      'ssl_provisioned',
      'active',
      'error'
    )),
  verification_token text,
  is_primary boolean not null default false,
  -- Operational columns mirrored from agency_domains for the sibling's
  -- Vercel/DNS flow (set as the verification lifecycle advances).
  verified_at timestamptz,
  ssl_provisioned_at timestamptz,
  last_health_check_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per hostname, globally (a domain maps to exactly one talent site).
create unique index if not exists talent_site_domains_domain_key
  on public.talent_site_domains (domain);

-- Lookup all domains for a talent's site.
create index if not exists idx_talent_site_domains_profile
  on public.talent_site_domains (talent_profile_id);

-- At most one PRIMARY domain per talent.
create unique index if not exists talent_site_domains_one_primary_per_profile
  on public.talent_site_domains (talent_profile_id)
  where is_primary = true;

-- Active-host resolution (anon render path resolves an active domain → site).
create index if not exists idx_talent_site_domains_active
  on public.talent_site_domains (domain)
  where status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- talent_pages — already RLS-enabled with the merged policy
-- `talent_pages_merged_all_public` (owner OR tenant-staff) + a public SELECT of
-- published rows (`talent_pages_public`). Those policies cover the new columns
-- as-is (no per-column RLS), so the multi-page rows stay owner+staff gated and
-- the published-page public read is unchanged. The Max-tier WRITE gate for
-- talent_pages is enforced at the ACTION layer (required_talent_tier on the row
-- + the calling action), matching the existing talent-page builder contract.
-- We intentionally DO NOT alter talent_pages RLS here (additive-only).
--
-- talent_sites — already RLS-enabled (owner select/insert/update). The new
-- config+shell columns are covered by those policies. No change needed.

-- talent_site_domains — owner-only reads; owner + Max for writes (airtight: a
-- free/pro talent cannot create or mutate a domain).
alter table public.talent_site_domains enable row level security;

drop policy if exists talent_site_domains_owner_select on public.talent_site_domains;
create policy talent_site_domains_owner_select
  on public.talent_site_domains
  for select
  using (is_talent_profile_owner(talent_profile_id));

drop policy if exists talent_site_domains_owner_max_insert on public.talent_site_domains;
create policy talent_site_domains_owner_max_insert
  on public.talent_site_domains
  for insert
  with check (
    is_talent_profile_owner(talent_profile_id)
    and talent_profile_has_max(talent_profile_id)
  );

drop policy if exists talent_site_domains_owner_max_update on public.talent_site_domains;
create policy talent_site_domains_owner_max_update
  on public.talent_site_domains
  for update
  using (
    is_talent_profile_owner(talent_profile_id)
    and talent_profile_has_max(talent_profile_id)
  )
  with check (
    is_talent_profile_owner(talent_profile_id)
    and talent_profile_has_max(talent_profile_id)
  );

drop policy if exists talent_site_domains_owner_max_delete on public.talent_site_domains;
create policy talent_site_domains_owner_max_delete
  on public.talent_site_domains
  for delete
  using (
    is_talent_profile_owner(talent_profile_id)
    and talent_profile_has_max(talent_profile_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Host-context resolution RPC (SECURITY DEFINER) — mirrors the
--    `talent_public_site_for_profile_code(text)` pattern. The anon render path
--    resolves an ACTIVE custom domain → the talent_profile_id + site_slug
--    without needing a broad public SELECT on the domains table. Only `active`
--    rows whose talent is not hidden and whose site is published are returned.
-- ─────────────────────────────────────────────────────────────────────────────

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
    and ts.site_published_at is not null;
$function$;

grant execute on function public.talent_site_domain_lookup(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. BACKFILL (commented — the LEAD runs this AFTER applying the DDL above).
--    For existing talent_sites rows that already have a published custom /
--    freeform PROFILE snapshot, ensure a `site_slug` is set so the site is
--    reachable at /t/site/<slug>. Derivation = slugified talent display_name
--    (fallback profile_code), de-duplicated with a numeric suffix on collision.
--    In this test env there are likely few/zero such rows. Reversible: clearing
--    site_slug back to NULL undoes it.
--
--    Run AS A ONE-OFF after the migration (NOT part of the DDL apply):
--
--    with candidates as (
--      select
--        ts.id,
--        tp.id as talent_profile_id,
--        coalesce(
--          nullif(regexp_replace(lower(trim(tp.display_name)), '[^a-z0-9]+', '-', 'g'), ''),
--          lower(tp.profile_code)
--        ) as base_slug
--      from public.talent_sites ts
--      join public.talent_profiles tp on tp.id = ts.talent_profile_id
--      where ts.site_slug is null
--        and ts.published_snapshot is not null
--    ),
--    numbered as (
--      select
--        c.id,
--        regexp_replace(trim(both '-' from c.base_slug), '-{2,}', '-', 'g') as clean_slug,
--        row_number() over (
--          partition by regexp_replace(trim(both '-' from c.base_slug), '-{2,}', '-', 'g')
--          order by c.id
--        ) as rn
--      from candidates c
--    )
--    update public.talent_sites ts
--    set site_slug = case when n.rn = 1 then n.clean_slug
--                         else n.clean_slug || '-' || n.rn::text end
--    from numbered n
--    where ts.id = n.id
--      and not exists (
--        select 1 from public.talent_sites x
--        where x.site_slug = case when n.rn = 1 then n.clean_slug
--                                 else n.clean_slug || '-' || n.rn::text end
--      );
--
--    NOTE: the production-grade backfill lives in
--    `scripts/backfill-talent-sites.ts` (slug derivation + cross-row dedupe in
--    application code, which the partial-unique index on site_slug also guards).
-- =============================================================================
