-- Builder Studio — Wave 0 / FND-1
-- Component-governance + staged-rollout columns shared by the parallel
-- workstreams (Pillars 3 + 4 of the 360 plan). Additive + backward-safe:
-- all columns are nullable or have a default, so existing reads/writes are
-- unaffected until a workstream wires behavior on top.

-- Pillar 3 — controllability, on the per-item catalog overlay.
alter table public.builder_catalog_overlay
  add column if not exists default_props          jsonb,
  add column if not exists locked_props           text[] not null default '{}'::text[],
  add column if not exists default_variant        text,
  add column if not exists data_source_defaults   jsonb;

-- Pillar 3 + 4 — controllability + rollout, on the DB templates.
alter table public.builder_templates
  add column if not exists default_props          jsonb,
  add column if not exists locked_props           text[] not null default '{}'::text[],
  add column if not exists data_source_defaults   jsonb,
  add column if not exists rollout_percentage     integer not null default 100,
  add column if not exists tenant_allowlist        uuid[] not null default '{}'::uuid[],
  add column if not exists tenant_denylist         uuid[] not null default '{}'::uuid[],
  add column if not exists changelog              text;

-- Rollout bucket must be a percentage.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'builder_templates_rollout_pct_chk'
  ) then
    alter table public.builder_templates
      add constraint builder_templates_rollout_pct_chk
      check (rollout_percentage between 0 and 100);
  end if;
end $$;

comment on column public.builder_catalog_overlay.default_props is 'Builder Studio: props merged OVER the variant-resolved props at insert (admin-set component defaults).';
comment on column public.builder_catalog_overlay.locked_props is 'Builder Studio: dot-path prop keys a tenant/talent may NOT edit (admin locks the look).';
comment on column public.builder_catalog_overlay.default_variant is 'Builder Studio: pins the AddGalleryNativeVariant baked at insert.';
comment on column public.builder_catalog_overlay.data_source_defaults is 'Builder Studio: default data binding (filterQuery/maxItems/pinnedIds) for connected components.';
comment on column public.builder_templates.rollout_percentage is 'Builder Studio: staged rollout ceiling 0-100; deterministic hash(tenant_id+id) bucket.';
comment on column public.builder_templates.tenant_allowlist is 'Builder Studio: tenants that always see this template (bypass the % bucket).';
comment on column public.builder_templates.tenant_denylist is 'Builder Studio: tenants that never see this template.';
comment on column public.builder_templates.changelog is 'Builder Studio: author note for the current published version.';
