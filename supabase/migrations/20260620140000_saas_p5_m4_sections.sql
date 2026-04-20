-- SaaS Phase 5 / M4 — Reusable sections governance hardening.
--
-- Prereqs:
--   * 20260620100000_saas_p5_m0_site_admin_foundations.sql —
--       cms_sections, cms_section_revisions, cms_page_sections (+RESTRICT FK),
--       cms_section_status ENUM, cms_sections_props_media_ref_check trigger.
--   * 20260620130000_saas_p5_m3_pages.sql —
--       extended cms_revision_kind ENUM with 'rollback' (sections revisions
--       reuse the same enum, so that is also what M4 rollback writes use).
--
-- This migration:
--   1. Adds a tenant-scoped revision lookup index
--      `idx_cms_section_revisions_tenant_section_created` so the admin
--      restore-from-revision UI can select (tenant_id, section_id, ORDER BY
--      created_at DESC) without a sort. Mirrors the M3 page-revisions index.
--   2. Ships a SECURITY DEFINER retention helper
--      `cms_section_revisions_trim(p_tenant_id, p_section_id, p_keep)` so the
--      nightly cron (future) can keep only the N most recent per section
--      (guardrail §5: 50 per cms_sections). M4 schedules nothing; the
--      function is idempotent + callable by platform admins.
--
-- Not in this migration (already in place from M0):
--   * cms_sections.name non-empty CHECK — already CONSTRAINT cms_sections_name_nonempty.
--   * cms_sections.version + schema_version columns — already present.
--   * cms_page_sections ON DELETE RESTRICT FK to cms_sections(id) — the
--     in-use guard for deletes — already installed in M0 §7.
--   * cms_sections_props_media_ref_check trigger — already installed in M0 §10.
--
-- Safety: idempotent via IF NOT EXISTS / CREATE OR REPLACE. No data loss.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. cms_section_revisions — tenant-scoped lookup index.
-- ---------------------------------------------------------------------------
--
-- M0 already installed `idx_cms_section_revisions_section_created` on
-- (section_id, created_at DESC). The admin restore modal always filters by
-- tenant_id too (RLS `is_staff_of_tenant` scopes it, but queries include the
-- explicit tenant_id column for correctness + cache-key stability). Add a
-- composite index so the common (tenant_id, section_id ORDER BY created_at
-- DESC) path is sort-free, matching the M3 pages pattern.

CREATE INDEX IF NOT EXISTS idx_cms_section_revisions_tenant_section_created
  ON public.cms_section_revisions (tenant_id, section_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. cms_section_revisions_trim — retention helper.
-- ---------------------------------------------------------------------------
--
-- Called by platform-admin / future cron. Keeps the `p_keep` most recent
-- revisions per (tenant_id, section_id) tuple, deleting the rest. Returns
-- the deleted count.
--
-- SECURITY DEFINER so platform cron can bypass row-level RLS; the function's
-- body scopes by the supplied tenant_id and requires platform admin caller
-- (bounces anyone else with ERRCODE 42501).

CREATE OR REPLACE FUNCTION public.cms_section_revisions_trim(
  p_tenant_id  UUID,
  p_section_id UUID,
  p_keep       INTEGER DEFAULT 50
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'cms_section_revisions_trim: caller must be platform admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_keep IS NULL OR p_keep < 1 THEN
    RAISE EXCEPTION 'cms_section_revisions_trim: p_keep must be >= 1'
      USING ERRCODE = '22023';
  END IF;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY tenant_id, section_id
             ORDER BY created_at DESC, id DESC
           ) AS rn
      FROM public.cms_section_revisions
     WHERE tenant_id  = p_tenant_id
       AND section_id = p_section_id
  )
  DELETE FROM public.cms_section_revisions r
   USING ranked
   WHERE r.id = ranked.id
     AND ranked.rn > p_keep;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cms_section_revisions_trim(UUID, UUID, INTEGER) IS
  'Phase 5 M4. Retention trim for cms_section_revisions. Keeps the N most recent per (tenant, section). Platform-admin only; nightly cron wires this (guardrail §5: 50 per cms_sections).';

-- Grant EXECUTE only to authenticated; the is_platform_admin() gate inside
-- the body is the real control.
GRANT EXECUTE ON FUNCTION public.cms_section_revisions_trim(UUID, UUID, INTEGER)
  TO authenticated;

COMMIT;
