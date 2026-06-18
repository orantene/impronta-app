-- T1.1 · MEDIA — enable video/doc binary upload (widen media-public bucket)
--
-- Builder Ecosystem 2026 · Phase 6 · Tier 1. Companion to
-- 20261102000000_media_asset_library_kinds.sql, which already widened the
-- public.media_assets TABLE side (asset_kind discriminant, relaxed image-only
-- mime CHECK, media_purpose enum += document/video). This migration is the
-- STORAGE-BUCKET side — the last gate that still rejects non-image binaries.
--
-- The upload route (web/src/app/api/admin/media/upload/route.ts) is already
-- video/doc-ready: it defines per-kind MIME maps + size caps
--   image    →  8 MB  (MAX_BYTES_IMAGE = MAX_UPLOAD_BYTES)
--   document → 25 MB  (MAX_BYTES_DOCUMENT)
--   video    → 200 MB (MAX_BYTES_VIDEO)
-- and enforces them in-process BEFORE touching storage (route lines 44-45 define
-- the caps; lines 160-165 reject oversize files with 413; lines 182-191 reject
-- off-allowlist MIME with 415). The only thing stopping a real upload is the
-- 'media-public' bucket created by 20260601152946_media_assets_builder_library.sql
-- with an images-only allowed_mime_types AND an 8 MB file_size_limit.
--
-- This migration:
--   1. Widens allowed_mime_types to add the video + document MIMEs the route
--      accepts, KEEPING every existing image entry (including the pre-existing
--      image/svg+xml — left untouched). NOTE: the upload route deliberately
--      EXCLUDES SVG from its IMAGE_MIME_TO_EXT map (XSS hardening), so SVG can
--      never be uploaded through the route regardless of this allowlist; the
--      entry is preserved only to avoid mutating existing behavior. We do NOT
--      add image/svg+xml for new uploads.
--   2. Raises file_size_limit 8 MB → 200 MB so the bucket no longer rejects the
--      25 MB doc / 200 MB video uploads the route already permits. This does NOT
--      lift any effective limit: the route still enforces the per-kind caps
--      (8/25/200 MB) in-process before storage, so 200 MB is the bucket ceiling
--      only and each kind stays bounded by its own route cap.
--
-- Setting the full array is naturally idempotent — re-running yields the same
-- bucket row.
--
-- LEAD-OWNED / UNAPPLIED: do NOT run db:push from the agent worktree. The Lead
-- applies this via the Supabase MCP before merge (per CLAUDE.md schema+code
-- shipping protocol).

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         -- images (existing — preserved verbatim, incl. svg the route won't emit)
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/gif',
         'image/svg+xml',
         -- video (route VIDEO_MIME_TO_EXT)
         'video/mp4',
         'video/quicktime',
         'video/webm',
         'video/x-msvideo',
         'video/x-matroska',
         -- documents (route DOCUMENT_MIME_TO_EXT)
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/plain',
         'text/csv'
       ]::text[],
       -- 200 MB — matches the route's largest per-kind cap (MAX_BYTES_VIDEO).
       -- Per-kind caps (8/25/200 MB) remain enforced in-process by the route.
       file_size_limit = 209715200
 WHERE id = 'media-public';
