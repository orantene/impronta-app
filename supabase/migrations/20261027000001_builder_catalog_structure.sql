-- Builder Studio — Wave 0 / FND-2
-- Catalog STRUCTURE overrides (Pillar 2): a polymorphic table that lets the
-- platform admin rename/reorder/hide tabs + categories, create categories,
-- and move a component to a different tab — synced to the live "+" gallery.
-- Per-item label/icon/category/plan/visibility stays in builder_catalog_overlay;
-- this table only describes the STRUCTURE (tabs, categories, item tab-moves).
--
-- RLS mirrors builder_catalog_overlay exactly: authenticated READ, super_admin
-- WRITE via is_super_admin().

create table if not exists public.builder_catalog_structure (
  ref               text primary key,                 -- 'tab:<id>' | 'cat:<id>' | 'item:<itemId>'
  kind              text not null check (kind in ('tab', 'category', 'item')),
  label_override    text,                              -- tab/category display name (global rename)
  icon_override     text,                              -- category (or tab) icon
  parent_tab        text,                              -- category->tab membership; for item rows = the tab the item is moved to
  sort_order        integer,                           -- order within parent (null -> code default / end)
  created           boolean not null default false,    -- a NEW tab/category with no code default
  hidden            boolean not null default false,    -- hide a built-in tab/category without deleting
  category_override text,                              -- for item rows: colocated category move (optional)
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now()
);

alter table public.builder_catalog_structure enable row level security;

drop policy if exists bcs_select_authenticated on public.builder_catalog_structure;
create policy bcs_select_authenticated
  on public.builder_catalog_structure
  for select to authenticated
  using (true);

drop policy if exists bcs_write_super_admin on public.builder_catalog_structure;
create policy bcs_write_super_admin
  on public.builder_catalog_structure
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

comment on table public.builder_catalog_structure is 'Builder Studio: admin-editable catalog STRUCTURE (tab/category rename, reorder, create, hide; item tab-moves). Read by the live "+" gallery + the Lab; synced via builder_catalog_version.';
