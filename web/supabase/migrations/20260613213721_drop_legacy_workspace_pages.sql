-- Drop the retired workspace_pages page-builder system.
--
-- The workspace_pages adapter / UI / `/p/` render clause / data-bridge read and
-- the `workspace_page` builder surface kind were removed in the page-system
-- consolidation (PR #370 — agency pages are now freeform cms_pages). Both tables
-- are empty (verified 0 rows in prod 2026-06-13) and have zero remaining code
-- references. The deployed code no longer touches them, so the drop is safe.
--
-- Drop the child revisions table first (it FKs workspace_pages), then the parent.
drop table if exists public.workspace_page_revisions;
drop table if exists public.workspace_pages;
