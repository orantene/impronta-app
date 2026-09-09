-- ============================================================================
-- The migration `cms_pages.blocks` never had
-- ============================================================================
--
-- WHAT WAS WRONG. `cms_pages.blocks` and `cms_pages.is_freeform` exist on the
-- live project and are in `src/lib/supabase/database.types.ts`, which is
-- generated from it. Neither appears in any of the 769 files in this
-- directory. They were applied by hand and the migration was never written.
--
-- The consequence is not theoretical. `loadVerbSlug` in
-- `src/lib/words/verb-destination.server.ts` does
-- `.select("slug, locale, blocks")`, so on any database built from this repo
-- the read fails with `column cms_pages.blocks does not exist`, the function
-- logs a warning and returns null, and every reserve button silently falls
-- back to the chat cue instead of linking to the published page that would
-- answer it. Seven call sites select the column. This was found on the
-- isolated `qa-journeys` branch — a database built the way a new environment
-- would be — where the storefront logged that error on every request.
--
-- WHY `IF NOT EXISTS` IS THE POINT, NOT LAZINESS. On production both columns
-- are already there, so this must be an exact no-op; its whole job is to let a
-- fresh database reach the same shape. A migration that tried to create them
-- unconditionally would fail on the one project that matters.
--
-- WHY THE TYPES ARE THE SOURCE HERE. `blocks` carries a `BuilderNode[]` — see
-- `TalentSiteSnapshot.builderTree` in `src/lib/talent-site/types.ts` and the
-- `blocks: tree` write in `page-role-actions.ts` — so the empty value is an
-- empty ARRAY, not an empty object. `Insert` marks both columns optional in
-- the generated types, which means production has defaults on both; matching
-- them is what keeps a rebuilt database and production the same database.
--
-- This closes one instance. `npm run journeys:audit` reports the rest: 58
-- objects the types say production has and no migration creates, of which the
-- `_archive_*`, `_backfill_*` and `_impronta_pages_backup_*` tables are
-- deliberate scratch and the remainder are this same defect.

BEGIN;

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS blocks      jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_freeform boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cms_pages.blocks IS
  'The page''s builder node tree as a BuilderNode[]. Freeform pages (is_freeform = true) '
  'build their content here; slot-mode pages leave it empty and use the snapshot columns. '
  'Read by loadVerbSlug to decide whether a page can answer a verb like "reserve".';

COMMENT ON COLUMN public.cms_pages.is_freeform IS
  'True when the operator builds this page''s tree in place rather than filling template '
  'slots. The homepage and system pages stay false.';

COMMIT;
