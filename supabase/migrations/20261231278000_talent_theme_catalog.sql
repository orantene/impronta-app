-- Talent theme gallery: CATALOG + SITE-LEVEL THEME (Phase 0 foundation)
-- =============================================================================
-- Plan: web/docs/talent-website-execution-plan-2026-09-23.md, "Theme gallery
-- model (foundation)". ADDITIVE ONLY and idempotent. Nothing reads these
-- columns until TALENT_THEME_GALLERY_ENABLED is on, and every new talent_sites
-- column defaults to "no theme", so existing Max sites render unchanged.
--
-- THE MODEL:
--   * `talent_theme_catalog` = one row per Design or Look (kind), keyed by
--     (kind, slug). Built-ins are authored in code and synced here by
--     `syncBuiltinTalentThemes()`; authored rows are a follow-up. A Design is a
--     `{ shellTree, homeTree }` payload built from the talent section kit with
--     `{{token}}` content + `token:` style refs only; a Look is a token map
--     (colors + fonts). `kind` lets Look split into palette / typography /
--     finish later with no migration (the check is widened, not replaced).
--   * `talent_sites` gains the SITE-level theme: the pinned Design (slug +
--     version), the applied Look slug, the published + draft token maps, a
--     compare-and-swap `theme_version`, and creation provenance.
--
-- RLS: catalog rows are world-readable ONLY when published (the gallery renders
-- for anon previews + signed-in talents). There are NO write policies: the
-- service role (deploy sync, server actions) is the only writer. talent_sites
-- keeps its existing owner+Max policies, which cover the new columns as-is.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. talent_theme_catalog
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.talent_theme_catalog (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('design', 'look')),
  slug text not null,
  title text not null,
  summary text not null default '',
  category text,
  tags text[] not null default '{}'::text[],
  -- Design: { shellTree, homeTree }. Look: { tokens }. Validated in code
  -- (theme-catalog/validate.ts) before any row is written.
  payload jsonb not null default '{}'::jsonb,
  -- Client-safe preview: { swatch?, thumbnailUrl?, fontPreview? }.
  preview jsonb not null default '{}'::jsonb,
  required_talent_tier text not null default 'talent_portfolio'
    check (required_talent_tier in ('talent_basic', 'talent_pro', 'talent_portfolio')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  source text not null default 'builtin'
    check (source in ('builtin', 'authored')),
  -- Content version of THIS row (bumped by the sync when the payload changes).
  -- Sites pin the design version they applied (talent_sites.theme_design_version).
  version integer not null default 1
    check (version >= 1),
  -- Payload SHAPE version (lets a reader migrate an old payload in code).
  schema_version integer not null default 1
    check (schema_version >= 1),
  sort_order integer not null default 0,
  -- "New" badge in the gallery until this instant (null = never new).
  is_new_until timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_theme_catalog_slug_format
    check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$')
);

create unique index if not exists talent_theme_catalog_kind_slug_key
  on public.talent_theme_catalog (kind, slug);

-- Gallery listing: published rows of one kind, in display order.
create index if not exists idx_talent_theme_catalog_published
  on public.talent_theme_catalog (kind, sort_order)
  where status = 'published';

comment on table public.talent_theme_catalog is
  'Talent website theme gallery: Designs (kit layout, token refs only) and Looks (color + font token maps). Built-ins synced from code; service role writes only.';

create or replace function public.talent_theme_catalog_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Trigger-only helper: EXECUTE is checked when the trigger is created, never
-- when it fires, so no API role needs it (PUBLIC named, see rls-grant-drift).
revoke execute on function public.talent_theme_catalog_set_updated_at() from public, anon, authenticated;

drop trigger if exists talent_theme_catalog_updated_at on public.talent_theme_catalog;
create trigger talent_theme_catalog_updated_at
  before update on public.talent_theme_catalog
  for each row execute function public.talent_theme_catalog_set_updated_at();

alter table public.talent_theme_catalog enable row level security;

-- Published rows only; drafts and archived rows stay invisible to clients.
-- No insert/update/delete policy: RLS denies every client write and the
-- service role (which bypasses RLS) is the only writer.
drop policy if exists talent_theme_catalog_published_read on public.talent_theme_catalog;
create policy talent_theme_catalog_published_read
  on public.talent_theme_catalog
  for select
  to anon, authenticated
  using (status = 'published');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. talent_sites → site-level theme
-- ─────────────────────────────────────────────────────────────────────────────

-- The Design the site's shell + home were last built from (slug + the catalog
-- row version at apply time). Null = legacy / hand-built site.
alter table public.talent_sites
  add column if not exists theme_design_slug text;

alter table public.talent_sites
  add column if not exists theme_design_version integer;

-- The Look last merged into design_tokens_draft. Null = no Look applied.
alter table public.talent_sites
  add column if not exists theme_look_slug text;

-- PUBLISHED site tokens (render reads these). Empty = today's behaviour
-- (platform default theme), which is what every existing site keeps.
alter table public.talent_sites
  add column if not exists design_tokens jsonb not null default '{}'::jsonb;

-- DRAFT site tokens (owner preview reads these; publish copies them over).
alter table public.talent_sites
  add column if not exists design_tokens_draft jsonb not null default '{}'::jsonb;

-- Compare-and-swap counter for the theme publish (bumped on every publish).
alter table public.talent_sites
  add column if not exists theme_version integer not null default 0;

-- How the site came to exist. Null on pre-existing rows until backfilled.
alter table public.talent_sites
  add column if not exists site_created_via text;

alter table public.talent_sites
  add column if not exists site_created_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'talent_sites_site_created_via_check'
      and conrelid = 'public.talent_sites'::regclass
  ) then
    alter table public.talent_sites
      add constraint talent_sites_site_created_via_check
      check (site_created_via is null or site_created_via in ('wizard', 'manager', 'legacy'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'talent_sites_design_tokens_object_check'
      and conrelid = 'public.talent_sites'::regclass
  ) then
    alter table public.talent_sites
      add constraint talent_sites_design_tokens_object_check
      check (
        jsonb_typeof(design_tokens) = 'object'
        and jsonb_typeof(design_tokens_draft) = 'object'
      );
  end if;
end
$$;
