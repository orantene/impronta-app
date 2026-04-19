-- SaaS Phase 1 / P1.A.9 — public.platform_audit_log (cross-tenant security/compliance audit).
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §4 + §11,
--      docs/saas/phase-0/02-capabilities-and-roles.md §6 (support access modes),
--      Plan §14.5 (Audit vs event vs action log — four distinct layers),
--      L11, L26.
--
-- This is Zone 1. Distinct from public.activity_log (tenant operational timeline),
-- inquiry_events (engine facts), inquiry_action_log (engine attempts). Never
-- collapse these four (L26).

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role          TEXT,
  action              TEXT        NOT NULL,
  target_type         TEXT,
  target_id           TEXT,
  tenant_id           UUID        REFERENCES public.agencies(id) ON DELETE SET NULL,
  support_mode        TEXT        CHECK (support_mode IN ('read_only','assisted_edit','emergency_override')),
  severity            TEXT        NOT NULL DEFAULT 'info'
                                    CHECK (severity IN ('info','warn','emergency','legal_hold')),
  reason              TEXT,
  session_id          UUID,
  ip_address          INET,
  user_agent          TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_audit_log IS
  'Cross-tenant audit for platform-scope actions + support mode reads/writes + emergency overrides + legal holds. Append-only. Agencies see only rows where tenant_id = their tenant (Phase 2 RLS). Plan §14.5, L11, L26.';

CREATE INDEX IF NOT EXISTS platform_audit_log_tenant_created_idx
  ON public.platform_audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_log_actor_idx
  ON public.platform_audit_log (actor_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_log_severity_idx
  ON public.platform_audit_log (severity, created_at DESC)
  WHERE severity IN ('emergency','legal_hold');

CREATE INDEX IF NOT EXISTS platform_audit_log_action_idx
  ON public.platform_audit_log (action, created_at DESC);

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

-- Phase 1: only staff (super_admin / agency_staff in the legacy sense) can
-- read. Phase 2 splits: platform roles see all; agency sees rows where
-- tenant_id = their tenant only.
DROP POLICY IF EXISTS platform_audit_log_staff_select ON public.platform_audit_log;
CREATE POLICY platform_audit_log_staff_select ON public.platform_audit_log
  FOR SELECT
  USING (public.is_agency_staff());

-- Append-only: inserts via SECURITY DEFINER wrappers in future phases. No
-- direct staff inserts/updates/deletes. Phase 2 adds a recordPlatformAudit()
-- helper.

COMMIT;
