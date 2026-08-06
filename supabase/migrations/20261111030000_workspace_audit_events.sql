-- Workspace Activity Log — unified per-tenant audit trail.
--
-- One row per meaningful action inside a workspace: settings changes, team
-- changes, roster edits, media upload/delete, page publishes, transaction
-- state changes, sign-ins, integrations, etc. This is a FIFTH, additive layer
-- next to the four existing ones (platform_audit_log / builder_lab_audit /
-- inquiry_events / booking_activity_log) — it does NOT replace any of them.
-- Writers dual-write here from the shared audit helpers plus direct calls at
-- mutation choke points (see web/src/lib/audit/workspace-audit.ts).
--
-- Write path: service-role ONLY (no INSERT policy) so rows cannot be forged
-- or spoofed from the client. Read path: active staff of the tenant.
-- Retention: workspace_audit_events_trim() below, wired to a Vercel cron.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- Who did it. actor_user_id is null for pure system events (cron, webhook).
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshot of the actor's display name/email at event time, so the log
  -- stays readable even if the profile is later renamed or deleted.
  actor_label TEXT,
  actor_kind TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_kind IN ('staff','talent','client','platform','system','guest')),
  -- Dotted machine action, e.g. 'settings.branding.updated', 'media.deleted'.
  action TEXT NOT NULL,
  -- Coarse filter bucket shown as the category dropdown in the UI.
  category TEXT NOT NULL
    CHECK (category IN (
      'settings','team','roster','media','pages','billing','messages',
      'auth','domain','integration','security','system'
    )),
  -- What was touched.
  target_type TEXT,
  target_id TEXT,
  target_label TEXT,
  -- Human-readable one-liner ("Updated branding: logo, accent color").
  summary TEXT,
  -- Small structured extras (changed keys, before/after fragments, counts).
  -- Writers keep this SMALL (< 2 KB) — never full entity snapshots.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  country TEXT,
  user_agent TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot path is "latest events for tenant, optionally by category/actor".
-- Keep the index count low — this table is insert-heavy.
CREATE INDEX IF NOT EXISTS workspace_audit_events_tenant_created_idx
  ON public.workspace_audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_audit_events_tenant_category_idx
  ON public.workspace_audit_events (tenant_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS workspace_audit_events_tenant_actor_idx
  ON public.workspace_audit_events (tenant_id, actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

ALTER TABLE public.workspace_audit_events ENABLE ROW LEVEL SECURITY;

-- Read: active staff of the tenant (membership-based, same boundary as the
-- rest of the workspace admin). No INSERT/UPDATE/DELETE policies on purpose:
-- all writes go through the service-role client, and rows are append-only.
DROP POLICY IF EXISTS workspace_audit_events_staff_select ON public.workspace_audit_events;
CREATE POLICY workspace_audit_events_staff_select
  ON public.workspace_audit_events
  FOR SELECT
  TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

GRANT SELECT ON public.workspace_audit_events TO authenticated;

-- Retention: cap per-tenant history so the table cannot grow unbounded.
-- Deletes rows older than retain_days, then trims any tenant still above
-- max_rows_per_tenant to its newest max_rows_per_tenant rows. Called by
-- /api/cron/workspace-audit-trim (service-role), never from user requests.
CREATE OR REPLACE FUNCTION public.workspace_audit_events_trim(
  retain_days INTEGER DEFAULT 180,
  max_rows_per_tenant INTEGER DEFAULT 50000
) RETURNS TABLE (deleted_by_age BIGINT, deleted_by_cap BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_age BIGINT := 0;
  v_cap BIGINT := 0;
BEGIN
  DELETE FROM public.workspace_audit_events
  WHERE created_at < now() - make_interval(days => retain_days);
  GET DIAGNOSTICS v_age = ROW_COUNT;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY tenant_id ORDER BY created_at DESC
           ) AS rn
    FROM public.workspace_audit_events
  )
  DELETE FROM public.workspace_audit_events e
  USING ranked r
  WHERE e.id = r.id AND r.rn > max_rows_per_tenant;
  GET DIAGNOSTICS v_cap = ROW_COUNT;

  RETURN QUERY SELECT v_age, v_cap;
END;
$$;

-- Service-role only — not callable from the browser.
REVOKE ALL ON FUNCTION public.workspace_audit_events_trim(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workspace_audit_events_trim(INTEGER, INTEGER) FROM anon, authenticated;

COMMIT;
