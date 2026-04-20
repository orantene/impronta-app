-- SaaS Phase 4 / P4.3 — tenantise CMS uniqueness.
--
-- Ref: Production-hardening pass. Closes the three tenant-blind unique
--      indexes on the CMS family so a second tenant cannot collide with
--      tenant #1 on common slugs/paths.
--
-- Before:
--   cms_pages_locale_slug_key           UNIQUE (locale, slug)
--   cms_posts_locale_slug_key           UNIQUE (locale, slug)
--   cms_redirects_old_path_active_key   UNIQUE (old_path) WHERE active = true
--
-- After:
--   cms_pages_tenant_locale_slug_key          UNIQUE (tenant_id, locale, slug)
--   cms_posts_tenant_locale_slug_key          UNIQUE (tenant_id, locale, slug)
--   cms_redirects_tenant_old_path_active_key  UNIQUE (tenant_id, old_path)
--                                              WHERE active = true
--
-- Edge cases:
--   * tenant_id is NOT NULL on all three tables (enforced by
--     20260601200700_saas_p1_tenant_id_enforce_not_null.sql), so the new
--     keys have no NULL slack to worry about.
--   * cms_navigation_items has no unique index — no change needed.
--   * cms_page_revisions / cms_post_revisions have no unique constraint on
--     editable fields — no change needed.
--
-- Safety: idempotent via DROP IF EXISTS + IF NOT EXISTS patterns.

BEGIN;

-- cms_pages ------------------------------------------------------------------
DROP INDEX IF EXISTS public.cms_pages_locale_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS cms_pages_tenant_locale_slug_key
  ON public.cms_pages (tenant_id, locale, slug);

-- cms_posts ------------------------------------------------------------------
DROP INDEX IF EXISTS public.cms_posts_locale_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS cms_posts_tenant_locale_slug_key
  ON public.cms_posts (tenant_id, locale, slug);

-- cms_redirects --------------------------------------------------------------
DROP INDEX IF EXISTS public.cms_redirects_old_path_active_key;

CREATE UNIQUE INDEX IF NOT EXISTS cms_redirects_tenant_old_path_active_key
  ON public.cms_redirects (tenant_id, old_path)
  WHERE active = true;

COMMIT;
