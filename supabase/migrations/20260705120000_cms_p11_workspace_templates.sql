-- Phase 11 — workspace-saved page templates.
--
-- Operator clicks "Save as template" on a page → snapshot of the
-- current section composition + theme tokens lands here as a row the
-- operator can apply later (or apply to a new tenant). Distinct from
-- the platform-owned starter recipes in `starter-action.ts` — those
-- are committed in code; these are tenant-saved.

create table if not exists public.cms_workspace_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  /* Display name + optional description (same as section name model). */
  name text not null,
  description text null,
  /* JSONB snapshot mirroring the published_homepage_snapshot shape:
     { slots: [{ slotKey, sectionTypeKey, schemaVersion, props, sortOrder, ... }] }
     plus optional themeTokens for "save with theme" templates. */
  snapshot_jsonb jsonb not null default '{}'::jsonb,
  theme_tokens_jsonb jsonb null,
  /* Visibility scope. 'private' = workspace-only; 'platform' is
     reserved for future curated marketplace (super_admin promotes). */
  visibility text not null default 'private'
    check (visibility in ('private', 'platform', 'archived')),
  source_page_id uuid null references public.cms_pages(id) on delete set null,
  source_page_locale text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cms_workspace_templates_tenant_idx
  on public.cms_workspace_templates (tenant_id, created_at desc);
create index if not exists cms_workspace_templates_visibility_idx
  on public.cms_workspace_templates (visibility, created_at desc);

alter table public.cms_workspace_templates enable row level security;

-- Phase B.2.A fix (2026-04-26): the original policy referenced
-- `p.tenant_id` on `public.profiles`, but the canonical SaaS-Phase-2
-- contract is that profiles.tenant_id does not exist; tenant memberships
-- live in a helper function. Rewritten to use the existing
-- `public.is_staff_of_tenant()` helper and to allow platform-promoted
-- templates to be read by any authenticated staff regardless of tenant.
create policy cms_workspace_templates_staff_read on public.cms_workspace_templates
  for select to authenticated
  using (
    public.is_staff_of_tenant(cms_workspace_templates.tenant_id)
    or cms_workspace_templates.visibility = 'platform'
  );

create policy cms_workspace_templates_staff_write on public.cms_workspace_templates
  for all to authenticated
  using (
    public.is_staff_of_tenant(cms_workspace_templates.tenant_id)
  );

comment on table public.cms_workspace_templates is
  'Phase 11 — workspace-saved page/site templates. Source of truth for the workspace template gallery; complements the platform starter-recipes shipped in code.';
