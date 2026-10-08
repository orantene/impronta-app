-- Maison free-website foundation (PR 1): catalog demo kind + for_design,
-- additive talent_sites design-state columns, FAQ items, import batches.
-- ADDITIVE ONLY. Nothing user-visible until TALENT_MAISON_THEME_ENABLED is on.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. talent_theme_catalog: kind demo + optional for_design scope
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.talent_theme_catalog
  drop constraint if exists talent_theme_catalog_kind_check;

alter table public.talent_theme_catalog
  add constraint talent_theme_catalog_kind_check
  check (kind in ('design', 'look', 'demo'));

alter table public.talent_theme_catalog
  add column if not exists for_design text;

comment on column public.talent_theme_catalog.for_design is
  'Optional Design slug this Look or Demo is scoped to. Null = global (any Design).';

create index if not exists idx_talent_theme_catalog_for_design
  on public.talent_theme_catalog (for_design)
  where for_design is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. talent_sites: pending design state (A4)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.talent_sites
  add column if not exists theme_demo_slug text;

alter table public.talent_sites
  add column if not exists custom_palette jsonb;

alter table public.talent_sites
  add column if not exists menu_style text;

alter table public.talent_sites
  add column if not exists pending_design jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'talent_sites_menu_style_check'
      and conrelid = 'public.talent_sites'::regclass
  ) then
    alter table public.talent_sites
      add constraint talent_sites_menu_style_check
      check (menu_style is null or menu_style in ('tabs', 'list', 'accordion'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'talent_sites_custom_palette_object_check'
      and conrelid = 'public.talent_sites'::regclass
  ) then
    alter table public.talent_sites
      add constraint talent_sites_custom_palette_object_check
      check (custom_palette is null or jsonb_typeof(custom_palette) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'talent_sites_pending_design_object_check'
      and conrelid = 'public.talent_sites'::regclass
  ) then
    alter table public.talent_sites
      add constraint talent_sites_pending_design_object_check
      check (pending_design is null or jsonb_typeof(pending_design) = 'object');
  end if;
end
$$;

comment on column public.talent_sites.pending_design is
  'Proposed design snapshot for a live site (apply / reset / reapply / restore). Null when nothing is pending.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. talent_content_import_batches (A7)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.talent_content_import_batches (
  id uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null references public.talent_profiles (id) on delete cascade,
  source_demo_slug text not null,
  selections jsonb not null default '{}'::jsonb,
  created_record_ids jsonb not null default '{}'::jsonb,
  resolutions jsonb not null default '{}'::jsonb,
  status text not null default 'complete'
    check (status in ('complete', 'partial', 'undone')),
  failed_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_content_import_batches_profile
  on public.talent_content_import_batches (talent_profile_id, created_at desc);

comment on table public.talent_content_import_batches is
  'Starter-content import batches for the free talent website. Writes are service-role only.';

alter table public.talent_content_import_batches enable row level security;

drop policy if exists talent_content_import_batches_owner_read on public.talent_content_import_batches;
create policy talent_content_import_batches_owner_read
  on public.talent_content_import_batches
  for select
  to authenticated
  using (public.is_talent_profile_owner(talent_profile_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. talent_faq_items (A6)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.talent_faq_items (
  id uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null references public.talent_profiles (id) on delete cascade,
  question text not null,
  answer text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  import_batch_id uuid references public.talent_content_import_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_faq_items_profile_status
  on public.talent_faq_items (talent_profile_id, status, sort_order);

create index if not exists idx_talent_faq_items_import_batch
  on public.talent_faq_items (import_batch_id)
  where import_batch_id is not null;

comment on table public.talent_faq_items is
  'Talent FAQ items for the free website (Maison FAQ section). Owner write via service role; public reads published.';

alter table public.talent_faq_items enable row level security;

drop policy if exists talent_faq_items_public_read on public.talent_faq_items;
create policy talent_faq_items_public_read
  on public.talent_faq_items
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists talent_faq_items_owner_read on public.talent_faq_items;
create policy talent_faq_items_owner_read
  on public.talent_faq_items
  for select
  to authenticated
  using (public.is_talent_profile_owner(talent_profile_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. offerings: optional import_batch_id for undo import
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.talent_offerings
  add column if not exists import_batch_id uuid
    references public.talent_content_import_batches (id) on delete set null;

create index if not exists idx_talent_offerings_import_batch
  on public.talent_offerings (import_batch_id)
  where import_batch_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Seed Maison · Nails demo catalog row (payload mirrored in code builtins)
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.talent_theme_catalog (
  kind, slug, title, summary, category, tags, for_design, payload, preview,
  required_talent_tier, status, source, version, schema_version, sort_order
) values (
  'demo',
  'maison-nails',
  'Nails & Lashes Artist',
  'Uñas y pestañas',
  'nails',
  array['bookings', 'menu']::text[],
  'maison',
  jsonb_build_object(
    'offering_mode', 'bookings',
    'default_look', 'maison-pink',
    'menu_style', 'tabs',
    'starter_content', jsonb_build_object(
      'images_licensed_for_reuse', false
    ),
    'image_licence', jsonb_build_object('reusable', false)
  ),
  jsonb_build_object(
    'swatch', jsonb_build_object(
      'primary', '#A82458',
      'secondary', '#FFF5F8',
      'accent', '#A82458',
      'background', '#FFFFFF',
      'ink', '#241F26'
    )
  ),
  'talent_basic',
  'published',
  'builtin',
  1,
  1,
  10
)
on conflict (kind, slug) do update set
  title = excluded.title,
  summary = excluded.summary,
  for_design = excluded.for_design,
  payload = excluded.payload,
  preview = excluded.preview,
  updated_at = now();
