-- STYLE-1 · DB-backed, site-scoped builder style classes + presets
-- ==============================================================================
-- Builder Ecosystem 2026 · Phase 5 · Wave 1.
--
-- Today the page-builder's named STYLE CLASSES (linked-style-classes-bar) and
-- STYLE PRESETS (style-presets-bar) live in per-browser localStorage:
--   * classes:  tulala:builder:style-classes:v1:<pageId>   (page-scoped, per-browser)
--   * presets:  tulala:builder:style-presets                (GLOBAL, per-browser)
--   * clipboard tulala:builder:style-clipboard              (GLOBAL, per-browser)
-- That makes them invisible across browsers / devices / collaborators.
--
-- STYLE-1 lifts both registries onto the SHARED BuilderSurfaceAdapter envelope so
-- every surface persists them identically (CompositionData.styleClasses /
-- .stylePresets on load → CompositionSaveInput on save). This migration adds the
-- backing columns each adapter reads/writes. NO new editor behaviour lives in the
-- DB: these are just two jsonb sinks per surface table, mirroring the existing
-- `theme` / `blocks` jsonb columns.
--
-- TABLE MAP (there is NO `site_shells` table — the agency site-shell is a
-- `cms_pages` row with system_template_key='site_shell', so cms_pages covers
-- homepage + cms_page + agency site_shell):
--   * cms_pages     → style_classes + style_presets  (homepage, cms_page, agency shell)
--   * talent_pages  → style_presets only is strictly required, but we ALSO add a
--                     dedicated style_classes column so the registry stops sharing
--                     the `theme` slice going forward. The adapter keeps reading
--                     `theme` as the graceful fallback for pre-migration rows.
--   * talent_sites  → style_classes + style_presets  (talent Max site shell + pages)
--
-- Idempotent: every statement is `ADD COLUMN IF NOT EXISTS`. All columns are
-- NULLABLE so a pre-migration row degrades safely (the adapter read path tolerates
-- NULL / absent and falls back to the SSR-hydrated localStorage seed). No RLS
-- changes: these columns inherit the existing row-level policies on each table
-- (staff/owner write, public read of published rows), exactly like `blocks` /
-- `theme`.
--
-- LEAD-OWNED / UNAPPLIED: do NOT run as part of the agent's work — the Lead
-- applies this via the Supabase MCP (apply_migration) immediately before merge,
-- so no adapter read path that references the new columns deploys ahead of it.
-- The adapter cores degrade safely (treat the column as absent → fall back to the
-- SSR-hydrated localStorage seed) if this is not yet applied.
-- ==============================================================================

-- 1. cms_pages — covers homepage, freeform cms_page, AND the agency site-shell row
--    (system_template_key='site_shell'). One pair of jsonb sinks.
alter table public.cms_pages
  add column if not exists style_classes jsonb;

alter table public.cms_pages
  add column if not exists style_presets jsonb;

comment on column public.cms_pages.style_classes is
  'STYLE-1: site-scoped builder style-class registry (id->class). Lifted off per-browser localStorage; read/written through the shared BuilderSurfaceAdapter styleClasses envelope.';
comment on column public.cms_pages.style_presets is
  'STYLE-1: site-scoped builder style presets + clipboard. Lifted off the GLOBAL per-browser localStorage keys onto the adapter envelope.';

-- 2. talent_pages — talent Max PROFILE freeform pages. Style classes historically
--    rode `talent_pages.theme`; add a dedicated `style_classes` column so the
--    registry no longer shares the theme slice. The adapter keeps reading `theme`
--    as the graceful fallback for pre-migration rows.
alter table public.talent_pages
  add column if not exists style_classes jsonb;

alter table public.talent_pages
  add column if not exists style_presets jsonb;

comment on column public.talent_pages.style_classes is
  'STYLE-1: dedicated site-scoped style-class registry for talent freeform pages. Supersedes the style-class slice previously merged into talent_pages.theme; the adapter falls back to theme when this is null.';
comment on column public.talent_pages.style_presets is
  'STYLE-1: site-scoped builder style presets + clipboard for talent freeform pages.';

-- 3. talent_sites — the talent Max SITE record (shell_tree / shell_published).
--    The site-shell builder + the talent profile-page builder both scope their
--    registries to the SITE, so the columns live on talent_sites.
alter table public.talent_sites
  add column if not exists style_classes jsonb;

alter table public.talent_sites
  add column if not exists style_presets jsonb;

comment on column public.talent_sites.style_classes is
  'STYLE-1: site-scoped builder style-class registry for the talent Max site (shell + pages). Travels with the site, not the browser.';
comment on column public.talent_sites.style_presets is
  'STYLE-1: site-scoped builder style presets + clipboard for the talent Max site.';
