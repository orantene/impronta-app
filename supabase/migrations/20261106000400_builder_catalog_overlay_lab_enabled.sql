-- Builder Catalog Overlay — Builder Lab visibility axis (Builder Lab Polish X6)
-- ============================================================================
-- X4 split the overlay's per-surface visibility into a TRUE 4-surface matrix
-- (talent_profile / talent_shell / workspace_page / workspace_shell). Those four
-- govern where a component ships on TENANT builders.
--
-- X6 adds a FIFTH, fully INDEPENDENT axis: visibility in the Builder LAB itself.
-- A super-admin can hide a component from the Lab's own Catalog/gallery
-- (`lab_enabled = false`) WITHOUT changing where it ships on any tenant surface,
-- and vice-versa — the axes are orthogonal. DO NOT conflate this with
-- target_context:'platform', which would hide every DB template from the Lab;
-- this is a dedicated overlay toggle that defaults to LAB-VISIBLE.
--
-- Lossless migration-forward: the column DEFAULTS to true, so every existing
-- overlay row (and every component with no overlay at all) stays Lab-visible the
-- day this lands. There is NO legacy column to backfill from — the read path
-- (`labEnabledForRow`) treats an absent value as `true`.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. No backfill needed (the DEFAULT covers
-- existing rows).
-- ============================================================================

ALTER TABLE public.builder_catalog_overlay
  ADD COLUMN IF NOT EXISTS lab_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.builder_catalog_overlay.lab_enabled IS
  'Builder Lab Polish X6 — independent 5th visibility axis: whether this component appears in the Builder Lab''s own Catalog/gallery. Orthogonal to the four tenant-surface toggles and to target_context. Default true (every component is Lab-visible).';
