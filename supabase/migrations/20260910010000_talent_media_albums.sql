-- Phase: persist talent media album list (just id + name + order).
--
-- The drawer's AlbumsEditorPro lets admins create / rename / delete photo
-- albums (Editorial, Lookbook, Behind-the-scenes …). Photos are tied to an
-- album via media_assets.metadata.albumId, but the album's display NAME has
-- nowhere to live — currently it's reducer-only and dies on reload, so
-- photos uploaded to "Editorial" reappear as "Untitled <uuid>" on next open.
--
-- Solution: store the album list as a JSONB array on talent_profiles.
-- Shape: [{ id: string, name: string, sortOrder?: number }]. Photos still
-- reference their album by id via metadata.albumId — this column only
-- carries the album metadata (name + ordering) that has no other home.
--
-- DOWN: drop the column.

BEGIN;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS media_albums_data JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.talent_profiles.media_albums_data IS
  'Photo album list. Array of {id, name, sortOrder?}. Photos reference their album via media_assets.metadata.albumId.';

COMMIT;
