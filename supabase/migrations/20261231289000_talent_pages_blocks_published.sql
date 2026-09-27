-- talent_pages: keep the live page body apart from the draft.
--
-- Before this migration a talent page had ONE body column (`blocks`). The
-- builder's save wrote it, and Publish only flipped `status`, so once a page
-- was published every later save went straight to visitors, while the editor
-- told the talent "visitors see the published version until you publish".
-- The site shell (`talent_sites.shell_tree` / `shell_published`) and the site
-- tokens (`design_tokens_draft` / `design_tokens`) already had this split; page
-- bodies did not.
--
-- `blocks` stays the DRAFT the editor reads and writes. `blocks_published` is
-- what visitors see: Publish copies `blocks` into it, and the public loaders
-- read it (falling back to `blocks` only where it is NULL).
--
-- `theme` is deliberately NOT snapshotted: it carries the page's design slice,
-- which has its own draft/live split inside the jsonb (`tokensDraft` vs
-- `tokens`) and its own publish flow.
--
-- Additive only. Old code keeps working: it never reads the new column.

BEGIN;

ALTER TABLE public.talent_pages
  ADD COLUMN IF NOT EXISTS blocks_published jsonb;

COMMENT ON COLUMN public.talent_pages.blocks_published IS
  'Page body visitors see. Copied from blocks on publish; NULL until first published. blocks is the draft.';

-- Backfill: every page that is already published keeps showing exactly what it
-- shows today. The autosave-revision trigger is paused for the backfill so it
-- does not write one revision row per published page for a no-op body copy.
ALTER TABLE public.talent_pages DISABLE TRIGGER talent_pages_autosave;

UPDATE public.talent_pages
   SET blocks_published = blocks
 WHERE status = 'published'
   AND blocks_published IS NULL;

ALTER TABLE public.talent_pages ENABLE TRIGGER talent_pages_autosave;

COMMIT;
