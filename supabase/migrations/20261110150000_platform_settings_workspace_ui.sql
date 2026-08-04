-- Platform-wide workspace-UI switches (platform_settings singleton).
-- Two HQ toggles on /platform/admin/settings that hide/show the workspace
-- shell's floating "+" quick-action button (BottomActionFab) and the
-- first-run 4-step admin tour. Both default OFF (hidden) — HQ opts surfaces
-- back in explicitly. Display-only; no data or flows depend on them.
alter table public.platform_settings
  add column if not exists workspace_fab_enabled boolean not null default false,
  add column if not exists workspace_tour_enabled boolean not null default false;
