-- SaaS Phase 5 / M0 — Defect fix for cms_pages_slug_nonempty vs. system-owned
-- homepage rows (slug = '').
--
-- Prereqs:
--   * cms_pages base table with CHECK (char_length(trim(slug)) > 0)
--     named cms_pages_slug_nonempty.
--   * 20260620100000_saas_p5_m0_site_admin_foundations.sql introduced
--     is_system_owned + system_template_key and documented the contract
--     that system-owned homepages use slug = '' (locale-root binding,
--     composite-key router lookup via (tenant_id, locale, system_template_key)).
--
-- Defect:
--   Phase 5's homepage contract is slug = '' for is_system_owned = TRUE
--   rows. The reserved-slug trigger cms_pages_reserved_slug_guard()
--   explicitly short-circuits on `slug IS NULL OR slug = ''` for that
--   reason. But the pre-Phase-5 CHECK constraint cms_pages_slug_nonempty
--   requires slug to be non-empty for ALL rows, contradicting the
--   system-homepage design. Consequence: application paths that create
--   homepages (e.g. web/src/lib/site-admin/server/homepage.ts
--   ensureHomepageRow() passing slug: "") fail at INSERT with
--   SQLSTATE 23514 violates check constraint "cms_pages_slug_nonempty".
--
-- Fix:
--   Drop the blanket non-empty CHECK and replace it with one scoped so
--   that non-system pages still require a non-empty trimmed slug, while
--   system-owned pages may use slug = '' (the Phase 5 homepage shape).
--
-- Behavior otherwise unchanged. No signature changes to any function.
-- Does NOT touch:
--   * cms_pages_reserved_slug_guard() (still short-circuits on slug = ''
--     and still enforces reserved-route rules for non-empty slugs).
--   * cms_pages_system_lookup_idx (the partial unique index on
--     (tenant_id, locale, system_template_key) that enforces one homepage
--     per (tenant, locale)).
--   * The tenant-scoped (tenant_id, locale, slug) unique index on
--     cms_pages, which already allows multiple rows with slug = '' across
--     different (tenant_id, locale) combinations.
--   * cms_pages_title_nonempty (parallel constraint on title, unchanged).
--
-- Idempotent: DROP ... IF EXISTS on the old constraint, and a conditional
-- ADD on the new constraint so reruns are safe.

BEGIN;

ALTER TABLE public.cms_pages
  DROP CONSTRAINT IF EXISTS cms_pages_slug_nonempty;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cms_pages_slug_nonempty_or_system'
      AND conrelid = 'public.cms_pages'::regclass
  ) THEN
    ALTER TABLE public.cms_pages
      ADD CONSTRAINT cms_pages_slug_nonempty_or_system
      CHECK (
        is_system_owned = TRUE
        OR char_length(trim(slug)) > 0
      );
  END IF;
END
$$;

COMMENT ON CONSTRAINT cms_pages_slug_nonempty_or_system ON public.cms_pages IS
  'Phase 5 M0 fix. Non-system pages still require a non-empty trimmed slug. System-owned pages (e.g. the homepage) may use slug = '''' per the locale-root binding documented in ensureHomepageRow() and cms_pages_reserved_slug_guard().';

COMMIT;
