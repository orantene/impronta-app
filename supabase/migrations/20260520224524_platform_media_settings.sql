-- platform_media_settings — ops knobs for the media-upload pipeline.
--
-- Sibling to lib/server/media-resize.ts: the code defaults remain authoritative,
-- but this table lets platform admins flip the most-touched knobs without a
-- code change (e.g. drop the cap from 30 MB → 5 MB for a tier, or kill-switch
-- the client-side compression pipeline if it misbehaves).
--
-- Two roles per row:
--   - tenant_id IS NULL → the single universal default (one such row, seeded
--     below to match the in-code defaults).
--   - tenant_id IS NOT NULL → per-tenant override. Each column nullable so a
--     tenant row can override just one knob and inherit the rest.
--
-- Resolver lives at web/src/lib/media/settings.ts and merges:
--   tenant column → universal column → in-code default
--
-- Auth: platform admins ('super_admin') manage every row. Service-role
-- reads happen on the server side (bypasses RLS naturally), so the
-- per-request resolver doesn't need a USING policy for "everyone".

create table if not exists public.platform_media_settings (
  id uuid primary key default gen_random_uuid(),

  -- NULL for the universal default row, set for per-tenant overrides.
  -- Cascade so deleting a tenant doesn't orphan its override.
  tenant_id uuid null references public.agencies(id) on delete cascade,

  -- Max raw bytes the client picker accepts. Defense-in-depth check on
  -- the legacy server-upload path uses this as well. Universal default:
  -- 30 MB (matches the in-browser pipeline assumption).
  max_image_upload_bytes bigint
    check (max_image_upload_bytes is null
           or (max_image_upload_bytes between 1048576 and 1073741824)),

  -- Longest-edge cap for the in-browser compressor. Also used as the
  -- server-side defense-in-depth resize target. Default 1800.
  max_long_edge_px integer
    check (max_long_edge_px is null
           or (max_long_edge_px between 200 and 8000)),

  -- JPEG re-encode quality on the browser pipeline (and the server-side
  -- guard pass). Stored as 1-100 to dodge floating-point ergonomics in
  -- the admin UI. Resolver divides by 100 for canvas.convertToBlob.
  jpeg_quality_pct integer
    check (jpeg_quality_pct is null
           or (jpeg_quality_pct between 1 and 100)),

  -- Kill switch. When false, every browser upload skips the compress +
  -- signed-PUT pipeline and falls back to the legacy server-side sharp
  -- route. Use this if the new pipeline misbehaves in prod and we need
  -- to revert everyone in seconds without a code deploy.
  client_compression_enabled boolean,

  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- At most one universal-default row.
create unique index if not exists platform_media_settings_universal_uniq
  on public.platform_media_settings (tenant_id)
  where tenant_id is null;

-- At most one per-tenant override row.
create unique index if not exists platform_media_settings_per_tenant_uniq
  on public.platform_media_settings (tenant_id)
  where tenant_id is not null;

-- Resolver looks up by tenant_id; small table, but keep the index honest.
create index if not exists platform_media_settings_tenant_id_idx
  on public.platform_media_settings (tenant_id);

-- Seed the universal-default row with the in-code defaults so the
-- resolver returns sensible numbers from day one.
insert into public.platform_media_settings (
  tenant_id,
  max_image_upload_bytes,
  max_long_edge_px,
  jpeg_quality_pct,
  client_compression_enabled
) values (
  null,
  31457280,  -- 30 MB
  1800,
  82,
  true
)
on conflict do nothing;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.platform_media_settings enable row level security;

-- Platform admins can do anything. Resolver runs server-side via the
-- service role, which bypasses RLS — no policy needed for "any staff
-- can read effective settings for their tenant" because that path goes
-- through the resolver, never through a Supabase JS client with the
-- caller's session.
--
-- 2026-05-20 push-fix: profiles has `app_role` only — `platform_role`
-- doesn't exist in the live schema, so the original `OR` clause failed
-- column-resolution before evaluation. Trimmed to the existing column.
create policy platform_media_settings_super_admin_all
  on public.platform_media_settings
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.app_role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.app_role = 'super_admin'
    )
  );

comment on table public.platform_media_settings is
  'Platform-admin knobs for the upload pipeline. tenant_id NULL = universal default; tenant_id set = per-tenant override. Resolver: web/src/lib/media/settings.ts.';
