-- Living components — Phase 1 (saved blocks).
--
-- Operator selects any builder-node subtree on the canvas and clicks
-- "Save as block" → the subtree snapshot lands here as a tenant-owned,
-- reusable component the operator can drop onto any page later. Distinct
-- from the code-shipped composition presets (BUILDER_NODE_COMPOSITION_PRESETS)
-- and from page-level workspace templates (cms_workspace_templates) — these
-- are user-authored, block-level, reusable building blocks.
--
-- Phase 1 stores a self-contained subtree and inserts COPIES (ids re-minted
-- on insert). A later phase can add instance-linking (edit master → update
-- all instances) by referencing this row from an instance node.

create table if not exists public.cms_builder_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  /* Display name + optional description (mirrors the section name model). */
  name text not null,
  description text null,
  /* The subtree's root BuilderNodeKind (container/split/card/heading/...),
     surfaced in the "My blocks" gallery for filtering + iconography. */
  root_kind text not null,
  /* JSONB snapshot of a single BuilderNode subtree (props + nested children).
     Tenant-agnostic shape so it can be inserted into any page. */
  subtree_jsonb jsonb not null default '{}'::jsonb,
  /* Visibility scope. 'private' = workspace-only; 'platform' reserved for a
     future curated component marketplace (super_admin promotes). */
  visibility text not null default 'private'
    check (visibility in ('private', 'platform', 'archived')),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_builder_components_tenant_idx
  on public.cms_builder_components (tenant_id, created_at desc);
create index if not exists cms_builder_components_visibility_idx
  on public.cms_builder_components (visibility, created_at desc);

alter table public.cms_builder_components enable row level security;

-- Mirrors cms_workspace_templates: staff of the owning tenant can read their
-- own, plus any platform-promoted component; writes are owning-tenant only.
-- Idempotent: this migration was renamed from a colliding timestamp
-- (20261005000000, which the remote ledger assigned to plan_trials_engine), so
-- the table + policies may already exist on remote from Phase 1 QA. Drop the
-- policies before recreating them so re-applying is a safe no-op.
drop policy if exists cms_builder_components_staff_read on public.cms_builder_components;
create policy cms_builder_components_staff_read on public.cms_builder_components
  for select to authenticated
  using (
    public.is_staff_of_tenant(cms_builder_components.tenant_id)
    or cms_builder_components.visibility = 'platform'
  );

drop policy if exists cms_builder_components_staff_write on public.cms_builder_components;
create policy cms_builder_components_staff_write on public.cms_builder_components
  for all to authenticated
  using (
    public.is_staff_of_tenant(cms_builder_components.tenant_id)
  );

comment on table public.cms_builder_components is
  'Living components Phase 1 — user-authored, block-level reusable builder-node subtrees. Source of truth for the "My blocks" gallery; complements code-shipped composition presets and page-level workspace templates.';
