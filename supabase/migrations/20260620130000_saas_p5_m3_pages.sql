-- SaaS Phase 5 / M3 — Pages governance hardening.
--
-- Prereqs:
--   * 20260416120000_cms_pages_and_redirects.sql   — base cms_pages
--   * 20260421120000_cms_page_post_revisions.sql   — cms_page_revisions + enum
--   * 20260601200200_saas_p1_tenant_id_cms.sql     — tenant_id columns
--   * 20260602100100_saas_p2_rls_tenant_scoped.sql — *_tenant_staff policies
--   * 20260608100000_saas_p4_cms_unique_indexes_tenant_scoped.sql — uniq on (tenant,locale,slug)
--   * 20260608110000_saas_p4_cms_public_read_tenant_scoped.sql — public RPCs
--   * 20260620100000_saas_p5_m0_site_admin_foundations.sql — is_system_owned,
--       system_template_key, template_schema_version, version,
--       og_image_media_asset_id, published_homepage_snapshot,
--       cms_pages_system_ownership_guard, cms_pages_reserved_slug_guard
--
-- This migration:
--   1. Extends `cms_revision_kind` ENUM with 'rollback' so M3 restore-from-
--      revision operations write a distinctly-kinded row (same pattern as
--      guardrails §5 — rollback is its own revision kind for page + homepage).
--   2. Extends `cms_page_revisions` with:
--        - version INTEGER               — the page.version at snapshot time
--        - template_schema_version INTEGER — the page.template_schema_version
--          at snapshot time (lets a rollback migrate forward if the platform
--          bumped the template schema since).
--   3. Adds a cms_pages_title_nonempty CHECK so empty titles never persist.
--   4. Ships a SECURITY DEFINER retention helper
--      `cms_page_revisions_trim(p_tenant_id, p_page_id, p_keep)` so the
--      nightly cron (future) can keep only the N most recent per page
--      (guardrail §5: 50 per cms_pages). M3 schedules nothing; the function
--      is idempotent + callable by platform admins.
--   5. Indexes the common revision lookup path for restore UI.
--
-- Safety: idempotent via IF NOT EXISTS / DO-block guards. No data loss.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. cms_revision_kind ENUM — add 'rollback'.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'cms_revision_kind'
       AND e.enumlabel = 'rollback'
  ) THEN
    ALTER TYPE public.cms_revision_kind ADD VALUE 'rollback';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. cms_page_revisions — add version + template_schema_version columns.
-- ---------------------------------------------------------------------------

ALTER TABLE public.cms_page_revisions
  ADD COLUMN IF NOT EXISTS version                 INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS template_schema_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.cms_page_revisions.version IS
  'Phase 5 M3. cms_pages.version at snapshot time. Restoring a revision creates a NEW page row bumped to version + 1 (not a direct swap).';

COMMENT ON COLUMN public.cms_page_revisions.template_schema_version IS
  'Phase 5 M3. cms_pages.template_schema_version at snapshot time. Rollback migrates forward via templates registry if the platform has bumped since.';

-- Useful for "list revisions for this page" admin UI.
CREATE INDEX IF NOT EXISTS idx_cms_page_revisions_tenant_page_created
  ON public.cms_page_revisions (tenant_id, page_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. cms_pages — title non-empty constraint (mirrors slug_nonempty).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_pages_title_nonempty'
       AND conrelid = 'public.cms_pages'::regclass
  ) THEN
    ALTER TABLE public.cms_pages
      ADD CONSTRAINT cms_pages_title_nonempty
      CHECK (char_length(trim(title)) > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. cms_page_revisions_trim — retention helper.
-- ---------------------------------------------------------------------------
--
-- Called by platform-admin / future cron. Keeps the `p_keep` most recent
-- revisions per (tenant_id, page_id) tuple, deleting the rest. Returns the
-- deleted count.
--
-- SECURITY DEFINER so platform cron can bypass row-level RLS; the function's
-- body scopes by the supplied tenant_id and requires platform admin caller
-- (bounces anyone else with ERRCODE 42501).

CREATE OR REPLACE FUNCTION public.cms_page_revisions_trim(
  p_tenant_id UUID,
  p_page_id   UUID,
  p_keep      INTEGER DEFAULT 50
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'cms_page_revisions_trim: caller must be platform admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_keep IS NULL OR p_keep < 1 THEN
    RAISE EXCEPTION 'cms_page_revisions_trim: p_keep must be >= 1'
      USING ERRCODE = '22023';
  END IF;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY tenant_id, page_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM public.cms_page_revisions
     WHERE tenant_id = p_tenant_id
       AND page_id   = p_page_id
  )
  DELETE FROM public.cms_page_revisions r
   USING ranked
   WHERE r.id = ranked.id
     AND ranked.rn > p_keep
  RETURNING 1 INTO v_deleted;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cms_page_revisions_trim(UUID, UUID, INTEGER) IS
  'Phase 5 M3. Retention trim for cms_page_revisions. Keeps the N most recent per (tenant, page). Platform-admin only; nightly cron wires this (guardrail §5: 50 per cms_pages).';

-- Grant EXECUTE only to authenticated; the is_platform_admin() gate inside
-- the body is the real control.
GRANT EXECUTE ON FUNCTION public.cms_page_revisions_trim(UUID, UUID, INTEGER)
  TO authenticated;

COMMIT;
