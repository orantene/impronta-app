-- Phase B.1 (M16) — site shell foundation.
--
-- Convergence-plan §4 / Phase B / mockup-implied (header + footer in every
-- numbered surface). Adds the data model for tenant-editable header and
-- footer composition; ZERO public-rendering change in this migration. The
-- Public reader, wrapper component, feature flag (default OFF), and the
-- backfill all ship later in B.1 / B.2 — this migration is pure schema.
--
-- Data-model choice (recorded for reviewers):
--
--   Option A — new table cms_site_shells. Cleanest namespace separation
--   but duplicates ~all of cms_pages (status, version, snapshot, audit,
--   draft/live composition via cms_page_sections).
--
--   Option B — extend cms_pages with system_template_key='site_shell'
--   ✓ chosen ✓
--   • Reuses publish flow, CAS, audit trail, RLS, draft/live separation,
--     section composition via cms_page_sections (page_id → shell row).
--   • Reuses published_page_snapshot for the baked composition.
--   • Public router already filters by status; we add an explicit
--     non-routability guard via the reserved slug `__site_shell__`.
--   • One-shell-per-tenant-per-locale enforced via a partial unique
--     index that doesn't conflict with the existing
--     cms_pages_tenant_locale_slug_key index.
--
-- Phase B.2 will: backfill one shell row per existing tenant per locale,
-- wire the EditShell to allow editing it, flip the feature flag on for
-- the impronta test tenant. The flag stays OFF in this migration's wake;
-- existing storefronts continue to render the hard-coded PublicHeader.

BEGIN;

-- ── Reserved slug guard ─────────────────────────────────────────────────
-- New rows with system_template_key='site_shell' MUST use slug='__site_shell__'.
-- Reserves the slug from any future tenant-authored use; combined with the
-- existing cms_pages_slug_nonempty_or_system check this keeps system rows
-- predictable and the public /p/<slug> reader naturally avoids them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cms_pages_site_shell_slug'
      AND conrelid = 'public.cms_pages'::regclass
  ) THEN
    ALTER TABLE public.cms_pages
      ADD CONSTRAINT cms_pages_site_shell_slug
      CHECK (
        system_template_key IS DISTINCT FROM 'site_shell'
        OR slug = '__site_shell__'
      );
  END IF;
END
$$;

-- ── One shell per tenant per locale ─────────────────────────────────────
-- Partial unique index, doesn't collide with cms_pages_tenant_locale_slug_key
-- (which uses slug). This lets the backfill action create a single shell
-- row deterministically per (tenant_id, locale) without race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS cms_pages_one_shell_per_tenant_locale
  ON public.cms_pages (tenant_id, locale)
  WHERE system_template_key = 'site_shell';

COMMENT ON INDEX public.cms_pages_one_shell_per_tenant_locale IS
  'Phase B.1 — one site_shell row per tenant per locale. Shell rows carry header + footer composition via cms_page_sections; rendered around every page by the storefront layout when the site-shell feature flag is on.';

COMMIT;
