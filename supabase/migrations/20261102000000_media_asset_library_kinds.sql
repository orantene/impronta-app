-- MEDIA-1 · Asset library — video/doc support, folders/tags, central alt manager
--
-- Shared-core change for the Builder Ecosystem 2026 program (Phase 5). The
-- media library data layer (web/src/lib/site-admin/media/assets.ts) is consumed
-- by EVERY builder surface's media picker (Builder Lab, admin storefront, talent
-- profile, talent site). Widening the shared read filter + picker once propagates
-- everywhere; this migration adds the schema columns the read layer needs to
-- discriminate non-image assets and surface free-text tags.
--
-- LEAD-OWNED / UNAPPLIED: do NOT run db:push from the agent worktree. The Lead
-- applies this via the Supabase MCP before merge (per CLAUDE.md schema+code
-- shipping protocol). All statements are idempotent (IF NOT EXISTS / DO-guards /
-- ADD VALUE IF NOT EXISTS) and additive, so re-running is safe and existing
-- builder trees stay byte-stable.
--
-- Findings that shaped this migration (verified against the live schema):
--   * media_assets.tags text[] ALREADY EXISTS (NOT NULL DEFAULT '{}') — no add.
--   * The media_variant_kind enum has image-only labels (original/card/gallery/
--     banner/lightbox/...); it does NOT carry 'video'/'document'. Rather than
--     mutate that load-bearing enum (used by image-variant logic + RLS), we add a
--     dedicated, nullable `asset_kind text` discriminant. Existing rows read back
--     as 'image' via COALESCE in the data layer, so the column can be absent and
--     the code still degrades safely.
--   * media_assets_builder_mime_check forces `mime LIKE 'image/%'`, which would
--     reject any video/doc row that records its real MIME. We relax it to also
--     permit video/*, application/* (pdf + office), text/plain, and text/csv.
--   * The media_purpose enum lacks 'document'/'video'; the upload route already
--     inserts those purpose strings for non-image kinds, so we add them too.
--   * SVG stays excluded at the upload allowlist (XSS) — unchanged here.

-- ─── 0. media_purpose enum gains document/video (upload route already writes) ──
-- Run OUTSIDE the transaction below: Postgres forbids ALTER TYPE ... ADD VALUE
-- inside an explicit BEGIN/COMMIT. These are additive + idempotent.
ALTER TYPE public.media_purpose ADD VALUE IF NOT EXISTS 'document';
ALTER TYPE public.media_purpose ADD VALUE IF NOT EXISTS 'video';

BEGIN;

-- ─── 1. asset_kind discriminant (nullable; code COALESCEs absent → 'image') ────
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS asset_kind text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.media_assets'::regclass
       AND conname  = 'media_assets_asset_kind_check'
  ) THEN
    ALTER TABLE public.media_assets
      ADD CONSTRAINT media_assets_asset_kind_check
      CHECK (asset_kind IS NULL OR asset_kind IN ('image', 'video', 'document'));
  END IF;
END $$;

COMMENT ON COLUMN public.media_assets.asset_kind IS
  'MEDIA-1. Library discriminant: image | video | document. Nullable — the data layer treats NULL as image (legacy rows) and infers from mime/extension when absent.';

-- Backfill existing rows so the library filter is stable. Anything that smells
-- like a video/doc by MIME becomes that kind; everything else stays image.
UPDATE public.media_assets
   SET asset_kind = CASE
     WHEN coalesce(mime, mime_type) LIKE 'video/%' THEN 'video'
     WHEN coalesce(mime, mime_type) IN (
       'application/pdf',
       'application/msword',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.ms-excel',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-powerpoint',
       'application/vnd.openxmlformats-officedocument.presentationml.presentation',
       'text/plain',
       'text/csv'
     ) THEN 'document'
     ELSE 'image'
   END
 WHERE asset_kind IS NULL;

-- ─── 2. Relax the image-only MIME check so video/doc rows can store real MIME ──
ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_builder_mime_check;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_builder_mime_check
  CHECK (
    mime IS NULL
    OR mime LIKE 'image/%'
    OR mime LIKE 'video/%'
    OR mime LIKE 'application/%'
    OR mime IN ('text/plain', 'text/csv')
  );

-- ─── 3. Indexes for the widened library read (kind-filtered, tag-filtered) ─────
CREATE INDEX IF NOT EXISTS media_assets_tenant_kind_created_idx
  ON public.media_assets (tenant_id, asset_kind, created_at DESC)
  WHERE deleted_at IS NULL;

-- tags GIN index was dropped by 20260615200004 as unused; the MEDIA-1 library
-- now filters by tag, so re-create it (idempotent).
CREATE INDEX IF NOT EXISTS media_assets_tags_gin
  ON public.media_assets USING gin (tags);

COMMIT;
