-- SEO-1 · Shared SEO metadata engine — talent_pages SEO columns
--
-- Adds the SEO/OG/canonical/JSON-LD column set to `talent_pages` so the talent
-- Max SITE (the separate /t/site/<slug> multi-page website) can describe SEO
-- through the SAME shared metadata envelope the storefront already uses
-- (`cms_pages` already carries the equivalents — see
-- 20260416120000_cms_pages_and_redirects.sql + 20260603082850_cms_pages_json_ld.sql;
-- this migration deliberately does NOT touch cms_pages).
--
-- CONTRACT-ONLY (SEO-1): these columns are the foundation. The per-route reads
-- + adapter writes that populate them are SEO-2. Until SEO-2 ships, the columns
-- are simply present and NULL.
--
-- Every column is NULLABLE + `ADD COLUMN IF NOT EXISTS` (idempotent): a re-run
-- is a no-op, and code that reads these columns degrades safely to NULL when a
-- row was created before the migration.
--
-- LEAD-OWNED / UNAPPLIED: per the program's schema+code shipping protocol the
-- Lead applies this via Supabase MCP (or `npm run db:push`) BEFORE merging the
-- SEO-2 code that reads the columns. No SEO-1 code path reads these columns, so
-- merging SEO-1 ahead of the apply is safe; SEO-2 must not deploy before it.

BEGIN;

ALTER TABLE public.talent_pages
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS og_title         text,
  ADD COLUMN IF NOT EXISTS og_description    text,
  ADD COLUMN IF NOT EXISTS og_image_url      text,
  ADD COLUMN IF NOT EXISTS canonical_url     text,
  ADD COLUMN IF NOT EXISTS noindex           boolean,
  ADD COLUMN IF NOT EXISTS json_ld           jsonb;

COMMENT ON COLUMN public.talent_pages.meta_description IS
  'SEO-1: meta description for the talent-site page <head>. NULL -> fall back to title.';
COMMENT ON COLUMN public.talent_pages.og_title IS
  'SEO-1: og:title override. NULL -> fall back to the page title.';
COMMENT ON COLUMN public.talent_pages.og_description IS
  'SEO-1: og:description override. NULL -> fall back to meta_description.';
COMMENT ON COLUMN public.talent_pages.og_image_url IS
  'SEO-1: absolute og:image URL for social cards.';
COMMENT ON COLUMN public.talent_pages.canonical_url IS
  'SEO-1: absolute canonical URL for THIS site page (never the /t/[code] profile).';
COMMENT ON COLUMN public.talent_pages.noindex IS
  'SEO-1: when true, emit <meta name="robots" content="noindex">. NULL/false -> indexable.';
COMMENT ON COLUMN public.talent_pages.json_ld IS
  'SEO-1: structured-data (JSON-LD) document emitted in <script type="application/ld+json">. NULL -> none.';

COMMIT;
