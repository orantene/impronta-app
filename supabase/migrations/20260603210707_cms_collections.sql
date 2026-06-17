-- Wave 5A (job #36) — operator-defined CONTENT COLLECTIONS + binding.
--
-- Lets a workspace define its own named, tenant-scoped content collections
-- ("Team", "Projects", "Testimonials") with a simple typed field set
-- (text / richtext / image / url / number / boolean) plus rows, and BIND a
-- freeform builder repeater to a collection so the container renders one item
-- per row. The existing repeater `dataBinding` already binds a container to a
-- data SOURCE via `sourceKey` + `repeat`; a user collection is just a new
-- bindable source kind addressed by `sourceKey = "collection:<id>"`. The render
-- repeat path resolves the collection's rows into `dataSources.collections`
-- (see render.tsx `collectionRecordsForSource`) and field-binds child node
-- props to collection fields via the existing `{{field_key}}` token mechanism.
--
-- TWO TABLES, mirroring the cms_* tenant-scoping + RLS conventions:
--   cms_collections       — one row per collection (name/slug + field schema)
--   cms_collection_items  — one row per content item (its values, ordered)
--
-- The field SCHEMA lives in `cms_collections.fields` (JSONB array of
-- { key, label, type }) and each item's content lives in
-- `cms_collection_items.data` (JSONB object keyed by field.key). JSONB keeps the
-- per-item shape flexible while the column set + tenancy stay strict — the same
-- pattern cms_pages.hero / cms_sections.props_jsonb already use.
--
-- Safety: fully idempotent (CREATE TABLE IF NOT EXISTS / CREATE POLICY guarded
-- by a DROP-IF-EXISTS). Additive only — no backfill, no destructive change.
-- Tenant-scoped with RLS so a workspace only ever sees + writes its own
-- collections; agency staff membership (agency_memberships, status='active')
-- is the authority, identical to the other tenant-owned CMS tables. The service
-- role bypasses RLS for the public storefront read path.
--
-- NOTE FOR THE INTEGRATOR: applied to the remote Supabase project
-- (pluhdapdnuiulvxmyspd) via the Supabase MCP apply_migration at author time so
-- the feature works at runtime. Reconcile schema_migrations to THIS file version
-- (20260603210707) — see the Wave-5A report for the version the MCP recorded.

-- ── cms_collections ─────────────────────────────────────────────────────────
create table if not exists public.cms_collections (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.agencies (id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text,
  -- Ordered field schema: [{ "key": "name", "label": "Name", "type": "text" }, …].
  -- Allowed types: text | richtext | image | url | number | boolean. Validated
  -- app-side (lib/site-admin/collections/types.ts) — JSONB keeps it open-ended.
  fields      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  updated_by  uuid references public.profiles (id) on delete set null,
  constraint cms_collections_slug_per_tenant unique (tenant_id, slug)
);

comment on table public.cms_collections is
  'Wave 5A. Operator-defined, tenant-scoped content collections (Team/Projects/…). fields = ordered JSONB field schema; rows live in cms_collection_items. Bound to a builder repeater via dataBinding.sourceKey = "collection:<id>".';

create index if not exists cms_collections_tenant_idx
  on public.cms_collections (tenant_id, created_at desc);

-- ── cms_collection_items ────────────────────────────────────────────────────
create table if not exists public.cms_collection_items (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.cms_collections (id) on delete cascade,
  -- Denormalized tenant_id so item RLS is a single-table membership check (and
  -- so the storefront loader can tenant-guard items without a join). Kept in
  -- sync app-side on insert; the FK to the collection guarantees correctness.
  tenant_id     uuid not null references public.agencies (id) on delete cascade,
  -- Per-item content keyed by the collection's field keys:
  -- { "name": "Ana", "role": "Director", "photo": "https://…" }.
  data          jsonb not null default '{}'::jsonb,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.cms_collection_items is
  'Wave 5A. One content row per item in a cms_collections collection. data = JSONB keyed by the collection field keys. tenant_id denormalized from the parent for single-table RLS + storefront tenant-guard.';

create index if not exists cms_collection_items_collection_idx
  on public.cms_collection_items (collection_id, sort_order, created_at);

create index if not exists cms_collection_items_tenant_idx
  on public.cms_collection_items (tenant_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.cms_collections      enable row level security;
alter table public.cms_collection_items enable row level security;

-- Collections: agency staff of the owning tenant have full CRUD. Membership in
-- agency_memberships (status='active') is the authority — identical to the
-- other tenant-owned CMS tables. The service role bypasses RLS entirely (used
-- by the public storefront render loader).
drop policy if exists cms_collections_staff_rw on public.cms_collections;
create policy cms_collections_staff_rw on public.cms_collections
  for all
  using (
    exists (
      select 1 from public.agency_memberships m
      where m.tenant_id = cms_collections.tenant_id
        and m.profile_id = auth.uid()
        and m.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.agency_memberships m
      where m.tenant_id = cms_collections.tenant_id
        and m.profile_id = auth.uid()
        and m.status = 'active'
    )
  );

-- Items: same membership authority, keyed on the item's denormalized tenant_id.
drop policy if exists cms_collection_items_staff_rw on public.cms_collection_items;
create policy cms_collection_items_staff_rw on public.cms_collection_items
  for all
  using (
    exists (
      select 1 from public.agency_memberships m
      where m.tenant_id = cms_collection_items.tenant_id
        and m.profile_id = auth.uid()
        and m.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.agency_memberships m
      where m.tenant_id = cms_collection_items.tenant_id
        and m.profile_id = auth.uid()
        and m.status = 'active'
    )
  );
