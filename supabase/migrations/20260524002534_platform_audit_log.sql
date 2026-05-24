-- Platform Users Control Center — slice M0.1
--
-- The `public.platform_audit_log` table was originally created in
-- 20260601100800_saas_p1_platform_audit_log.sql for cross-tenant support
-- audits. The M0.1 spec
-- (web/docs/platform-users-control-center-plan-2026-05-23.md §2) calls for
-- per-user admin-action audit rows with a slightly different shape
-- (actor_user_id, target_kind, before_jsonb, after_jsonb, context_jsonb).
--
-- Rather than create a parallel table, this migration EXTENDS the existing
-- table additively so both write paths share one audit stream. The original
-- columns remain unchanged; rows written by the M0.1 helper leave the
-- legacy support-mode columns NULL, and rows written by the legacy SaaS
-- helper leave the new columns NULL.
--
-- RLS already on the table: SELECT restricted to staff. No INSERT policy →
-- writes go through the service-role client only.

BEGIN;

-- New columns required by M0.1.
ALTER TABLE public.platform_audit_log
  ADD COLUMN IF NOT EXISTS actor_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_kind    text,
  ADD COLUMN IF NOT EXISTS before_jsonb   jsonb,
  ADD COLUMN IF NOT EXISTS after_jsonb    jsonb,
  ADD COLUMN IF NOT EXISTS context_jsonb  jsonb;

-- target_kind CHECK constraint (enum-like). Drop first so re-runs are safe.
ALTER TABLE public.platform_audit_log
  DROP CONSTRAINT IF EXISTS platform_audit_log_target_kind_check;
ALTER TABLE public.platform_audit_log
  ADD CONSTRAINT platform_audit_log_target_kind_check
  CHECK (
    target_kind IS NULL
    OR target_kind IN ('profile', 'talent_profile', 'workspace', 'membership')
  );

-- Index for the M0.1 read pattern: "show me all admin actions against this user".
CREATE INDEX IF NOT EXISTS platform_audit_log_target_kind_id_idx
  ON public.platform_audit_log (target_kind, target_id, created_at DESC)
  WHERE target_kind IS NOT NULL;

-- M0.1 spec requires read access for super_admin. The existing staff policy
-- (is_agency_staff()) already covers super_admin in current code, but the
-- spec is explicit, so add a redundant-but-clear policy keyed on profiles.app_role.
DROP POLICY IF EXISTS platform_audit_log_super_admin_select ON public.platform_audit_log;
CREATE POLICY platform_audit_log_super_admin_select
  ON public.platform_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.app_role = 'super_admin'
    )
  );

COMMENT ON COLUMN public.platform_audit_log.actor_user_id IS
  'M0.1: auth.users id of the super_admin who performed the action. Distinct from actor_profile_id (legacy) — kept side-by-side to avoid breaking the original SaaS support-audit write path.';
COMMENT ON COLUMN public.platform_audit_log.target_kind IS
  'M0.1: one of profile / talent_profile / workspace / membership. NULL for legacy rows written by the SaaS support-audit helper.';
COMMENT ON COLUMN public.platform_audit_log.before_jsonb IS
  'M0.1: snapshot of mutated fields before the action.';
COMMENT ON COLUMN public.platform_audit_log.after_jsonb IS
  'M0.1: snapshot of mutated fields after the action.';
COMMENT ON COLUMN public.platform_audit_log.context_jsonb IS
  'M0.1: free-form context (reason text, affected ids, etc.). Distinct from legacy `metadata` so writes do not collide.';

COMMIT;
