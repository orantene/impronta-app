-- Builder Lab Activity / Audit Log — G1 (governance accountability backbone)
-- ============================================================================
-- public.builder_lab_audit — one row per super_admin governance WRITE in the
-- Builder Lab control-plane (overlay set/clear, template publish/unpublish/
-- archive, rollout change). Each row carries a before/after JSON diff, the
-- acting super-admin (`actor`), and a timestamp, powering:
--   - a reverse-chron "Activity" feed in the Lab Catalog, and
--   - a per-row history affordance on the catalog row table.
--
-- Inserts are append-only and happen exclusively through the service-role admin
-- client behind the requireSuperAdmin() server gate (mirroring the best-effort
-- revision-snapshot insert), so NO insert policy is needed. Reads are gated to
-- platform-admin / super-admin readers, consistent with how other
-- platform-admin tables expose their governance state.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.builder_lab_audit (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_ref    text,                                   -- AddGalleryItem id for overlay writes ("el-button" / "db-template:<uuid>")
  template_id uuid,                                   -- raw builder_templates.id for lifecycle writes
  action      text        NOT NULL,                   -- 'overlay.set' | 'overlay.clear' | 'template.publish' | ...
  before      jsonb,
  after       jsonb,
  actor       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS builder_lab_audit_created_at_idx
  ON public.builder_lab_audit (created_at DESC);

-- Per-row history affordance filters by item_ref / template_id; partial indexes
-- keep those lookups cheap.
CREATE INDEX IF NOT EXISTS builder_lab_audit_item_ref_idx
  ON public.builder_lab_audit (item_ref, created_at DESC)
  WHERE item_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS builder_lab_audit_template_id_idx
  ON public.builder_lab_audit (template_id, created_at DESC)
  WHERE template_id IS NOT NULL;

COMMENT ON TABLE public.builder_lab_audit IS
  'Append-only activity log of super_admin Builder Lab governance writes (overlay + template lifecycle) with before/after diffs. Inserted via service-role behind requireSuperAdmin(); read by platform admins.';
COMMENT ON COLUMN public.builder_lab_audit.item_ref IS
  'AddGalleryItem id for overlay writes (code item id or "db-template:<uuid>"); null for pure template-lifecycle rows.';
COMMENT ON COLUMN public.builder_lab_audit.template_id IS
  'Raw builder_templates.id for template-lifecycle writes; null for code-item overlay rows.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Reads gated to super-admin (the Lab is super_admin-only); inserts go through
-- the service-role client, which bypasses RLS, so no insert policy is declared.

ALTER TABLE public.builder_lab_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bla_select_super_admin ON public.builder_lab_audit;
CREATE POLICY bla_select_super_admin ON public.builder_lab_audit
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

COMMIT;
