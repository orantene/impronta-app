-- P4-SEO (T4.3) — operator-authored JSON-LD structured data on cms_pages.
--
-- The Page settings drawer's "Structured data" card lets an operator paste a
-- schema.org JSON-LD document (single object or array of objects). It is
-- validated app-side (lib/site-admin/cms-seo.ts → parsePageJsonLd) before it
-- lands here, and emitted into the page <head>/tree as
--   <script type="application/ld+json"> … </script>
-- by the storefront render paths (app/page.tsx homepage, app/(public)/p/[[...slug]]).
--
-- Stored as JSONB so it round-trips cleanly through the existing metadata
-- read/save projection (composition-actions.ts) and the published homepage
-- snapshot. NULL = no structured data authored for this page.
--
-- Safety: idempotent (ADD COLUMN IF NOT EXISTS). No backfill, no constraint —
-- the shape is enforced app-side, not by the DB, because schema.org vocabulary
-- is open-ended.
--
-- NOTE FOR THE INTEGRATOR: this migration is committed but NOT applied to the
-- remote Supabase project. Run `npm run db:push` before merging to main, or the
-- production storefront 500s when reading a page that references json_ld.

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS json_ld JSONB;

COMMENT ON COLUMN public.cms_pages.json_ld IS
  'P4-SEO. Operator-authored schema.org JSON-LD (object or array of objects). Validated app-side; emitted as <script type="application/ld+json">. NULL = none.';
