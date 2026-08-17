-- SEO-3 · talent_pages.meta_title — close the last no-op Page settings field
--
-- The SEO-1 migration (20261100000000_talent_pages_seo_columns.sql) added the
-- OG/canonical/JSON-LD set to `talent_pages` but deliberately omitted
-- `meta_title`, on the reasoning that the talent-site SEO envelope could use the
-- page `title` as the SERP/tab title. In practice the shared Page settings
-- drawer exposes a distinct "Meta title" field (SERP / tab override) on EVERY
-- builder surface, so on talent pages that one field stayed a silent no-op even
-- after #1212 wired the other seven columns end to end.
--
-- This column makes it real, matching the long-standing `cms_pages.meta_title`
-- and the platform-wide read convention (`metaTitle || title` — see
-- web/src/app/page.tsx). NULL -> fall back to the page title, so every existing
-- row keeps its current rendered <title> unchanged.
--
-- NULLABLE + `ADD COLUMN IF NOT EXISTS` (idempotent): a re-run is a no-op, and
-- code reading the column degrades safely to NULL on a pre-migration row.

BEGIN;

ALTER TABLE public.talent_pages
  ADD COLUMN IF NOT EXISTS meta_title text;

COMMENT ON COLUMN public.talent_pages.meta_title IS
  'SEO-3: SERP/tab title override for the talent-site page. NULL -> fall back to talent_pages.title.';

COMMIT;
