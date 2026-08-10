-- 20261112000000_branding_media_folder_system_key.sql
--
-- Branding & media manager (Settings → Brand identity): workspace branding
-- uploads now register as real media_assets rows (purpose='branding',
-- ownership_kind='agency', owner_tenant_id set) and auto-file into a
-- per-tenant "Branding" folder. This migration gives media_folders a machine
-- key so the app can find/create that folder deterministically per tenant.
-- The folder is lazy-created on first use — new tenants get it automatically,
-- no seed backfill needed, which keeps this tenant-SaaS-generic.

alter table public.media_folders
  add column if not exists system_key text;

comment on column public.media_folders.system_key is
  'Well-known machine key (e.g. ''branding'') for folders the app auto-creates per tenant. NULL for user-created folders. Lazy-created on first use.';

create unique index if not exists media_folders_tenant_system_key_uniq
  on public.media_folders (tenant_id, system_key)
  where system_key is not null;
