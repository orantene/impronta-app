-- 20261122000000_talent_pages_meta_title.sql
--
-- RECOVERED MIGRATION — this one carries REAL DDL, not a no-op.
--
-- `supabase_migrations.schema_migrations` carried a row for version
-- 20261122000000 ("talent_pages_meta_title") with no file in this repo — one of
-- the 15 orphans that made `npm run db:push` fail repo-wide with
-- LegacyDbPushMissingLocalError.
--
-- Unlike its sibling placeholders, this one is NOT a duplicate of a canonical
-- file: `talent_pages.meta_title` is created by NOTHING on main. The nearest
-- migration, 20261100000000_talent_pages_seo_columns.sql (SEO-1), adds
-- meta_description / og_* / canonical_url / noindex / json_ld but NOT
-- meta_title, which arrived later as SEO-3 and was applied straight to the
-- database through the Management API — so its `statements` were recorded only
-- as 'applied_via_management_api' and the DDL was never captured anywhere.
--
-- Net effect before this file: production HAS the column (and shipped code
-- reads it), while a database rebuilt from these migrations would NOT — the
-- talent-site SEO title read path would break on a fresh environment.
--
-- Reconstructed from the live column definition and its stored comment. Both
-- statements are idempotent, so this is a no-op against the existing database
-- and correct on a fresh rebuild.

BEGIN;

ALTER TABLE public.talent_pages
  ADD COLUMN IF NOT EXISTS meta_title text;

COMMENT ON COLUMN public.talent_pages.meta_title IS
  'SEO-3: SERP/tab title override for the talent-site page. NULL -> fall back to talent_pages.title.';

COMMIT;
