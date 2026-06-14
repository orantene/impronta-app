-- Platform-admin email console — advanced tier (P3b).
--
-- Two admin overlays on top of the CODE notification catalog:
--   1. notification_overlay           — per-entry channel enable/disable (toggles)
--   2. notification_template_override — per-(entry, locale) editable subject/body
--
-- Both are managed only by super_admins through the service-role-backed console
-- actions, and read by the dispatcher / email channel via the service-role
-- client. RLS is ENABLED with NO public policy, so only the service-role client
-- (which bypasses RLS) can touch them — no anon/authenticated access is granted.

create table if not exists public.notification_overlay (
  catalog_entry_id text primary key,
  -- NULL = "use the code default" (channel on). true/false = explicit override.
  email_enabled    boolean,
  in_app_enabled   boolean,
  updated_by       uuid,
  updated_at       timestamptz not null default now()
);

comment on table public.notification_overlay is
  'Admin overlay on the code notification catalog: per-entry channel enable/disable. NULL column = use code default (on). Required (transactional) entries are never disabled by the dispatcher.';

create table if not exists public.notification_template_override (
  id               uuid primary key default gen_random_uuid(),
  catalog_entry_id text not null,
  locale           text not null default 'en',
  subject          text,
  body_markdown    text,
  -- false = ignore this override and render the code template.
  enabled          boolean not null default true,
  updated_by       uuid,
  updated_at       timestamptz not null default now(),
  unique (catalog_entry_id, locale)
);

comment on table public.notification_template_override is
  'Admin override of an email entry''s subject/body per (catalog_entry_id, locale). The email render path consults this BEFORE the code template; enabled=false or no row falls back to the code default.';

alter table public.notification_overlay enable row level security;
alter table public.notification_template_override enable row level security;
-- Intentionally NO policies: the service-role client (gated console actions +
-- the dispatcher) bypasses RLS; there is no anon/authenticated path to these.
