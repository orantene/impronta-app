-- =============================================================================
-- Restore `inquiries.uses_new_engine` as a constant-TRUE stub column.
-- =============================================================================
--
-- Background: migration 20260524000000_drop_uses_new_engine.sql dropped the
-- Phase-2 cutover flag on the assumption that every runtime reader had been
-- removed. That assumption was incomplete — the live admin/talent/client
-- workspace paths still SELECT `uses_new_engine` in ~30 code sites
-- (admin/inquiries list + detail page, client/talent detail pages, engine
-- helpers, admin actions). With the column dropped, every read errors with
-- `42703 column inquiries.uses_new_engine does not exist`, which renders the
-- admin inquiry queue and detail pages unusable (QA surfaced this during M5
-- browser verification).
--
-- Correct long-term cleanup is to remove the code references. That is a
-- multi-file refactor orthogonal to the Admin Workspace V3 track and out of
-- scope for M5/M6. This migration reinstates the column as a *stub* so the
-- app works identically to its Phase-2 behaviour: every inquiry is already
-- V2 by construction, so the column is a constant TRUE.
--
-- Strategy:
--   * Re-add the column as `BOOLEAN DEFAULT TRUE NOT NULL`. DEFAULT TRUE
--     covers INSERTs that never mention it (current code always sets it TRUE
--     explicitly, but this is defensive).
--   * Any INSERT that sets `uses_new_engine = TRUE` continues to work.
--   * Any SELECT returning the column sees TRUE, which matches the only
--     path the post-Phase-2 code exercises. No row can be FALSE.
--   * Idempotent via IF NOT EXISTS.
--
-- When the code-side cleanup lands, this column and its references can be
-- dropped together in a follow-up migration. Until then, this restore keeps
-- git migrations and hosted DB state consistent with running code.
-- =============================================================================

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS uses_new_engine BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill is unnecessary (DEFAULT applies to existing rows on ADD COLUMN with
-- a constant default in PG 11+), but we pin it explicitly for determinism.
UPDATE public.inquiries SET uses_new_engine = TRUE WHERE uses_new_engine IS DISTINCT FROM TRUE;
