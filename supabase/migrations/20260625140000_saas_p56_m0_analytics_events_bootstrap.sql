-- SaaS Phase 5/6 M0 — adjacent remediation: analytics_events table bootstrap.
--
-- Ref: docs/saas/phase-5-6/m0-apply-runbook.md §8,
--      docs/saas/phase-5-6/m0-blockers.md §informational item 1.
--
-- Context
--   `web/src/lib/analytics/server-log.ts` inserts product events via the
--   service-role client into `public.analytics_events`. On the linked DB as
--   of 2026-04-21 this table does NOT exist — writes silently fail (the
--   writer swallows errors and only warns in NODE_ENV=development). The
--   original creation migration (`20260413120000_analytics_internal_tables`)
--   was never applied on this project. The later tenantise step
--   (`20260601200300_saas_p1_tenant_id_analytics`) is already guarded by
--   `to_regclass(...)` and no-ops when the table is missing.
--
-- Scope (deliberately narrow)
--   Creates `analytics_events` ONLY — the single table with an active
--   writer that is silently dropping events today. The companion tables
--   from the original migration (analytics_daily_rollups,
--   analytics_funnel_steps, analytics_search_sessions,
--   analytics_kpi_snapshots, analytics_api_cache) are not created here
--   because no production caller currently depends on them. Adding them
--   remains a separate slice if external GA4/GSC integrations activate.
--
-- Shape
--   Mirrors the columns from `20260413120000_analytics_internal_tables`
--   PLUS the `tenant_id UUID` column that `20260601200300` would add
--   post-hoc. Created in the final shape directly (no add-then-backfill)
--   because the table starts empty.
--
-- Tenancy + RLS
--   - `tenant_id` NOT NULL for new rows via default = first-agency helper
--     tenant; writer may also set it explicitly. Existing behaviour of
--     `logAnalyticsEventServer` does NOT set tenant_id — callers that
--     need tenant-scoped analytics should pass it. For the short term,
--     legacy (un-tenanted) writes default to the demo tenant UUID
--     (`00000000-0000-0000-0000-000000000001`) matching the backfill
--     constant used in `20260601200300`. A follow-up slice must tag
--     callers with the current request tenant (tracked separately from
--     M0).
--   - RLS: anon + authenticated INSERT allowed (event writes come from
--     browser pings and server handlers without a user session). SELECT
--     gated to `public.is_agency_staff()` (confirmed present on linked
--     DB).
--
-- Idempotent: every statement uses CREATE IF NOT EXISTS / DROP IF EXISTS +
-- CREATE. Safe to rerun.

BEGIN;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT,
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  talent_id UUID REFERENCES public.talent_profiles (id) ON DELETE SET NULL,
  path TEXT,
  locale TEXT,
  tenant_id UUID
    NOT NULL
    DEFAULT '00000000-0000-0000-0000-000000000001'::UUID
    REFERENCES public.agencies (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON public.analytics_events (name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_talent
  ON public.analytics_events (talent_id, created_at DESC)
  WHERE talent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_created
  ON public.analytics_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_name_created
  ON public.analytics_events (tenant_id, name, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_events_insert_public ON public.analytics_events;
CREATE POLICY analytics_events_insert_public ON public.analytics_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS analytics_events_select_staff ON public.analytics_events;
CREATE POLICY analytics_events_select_staff ON public.analytics_events
  FOR SELECT
  USING (public.is_agency_staff());

COMMENT ON TABLE public.analytics_events IS
  'Append-only product analytics events. Writes: anon+authenticated via '
  'track-client.ts or service role via server-log.ts. Reads: agency staff only. '
  'Bootstrap migration: supabase/migrations/20260625140000_saas_p56_m0_analytics_events_bootstrap.sql.';

COMMIT;

-- ---------------------------------------------------------------------------
-- Rollback reference — destructive, only safe if no downstream rollup jobs
-- depend on historical rows. Prefer fix-forward.
--
-- BEGIN;
--   DROP TABLE IF EXISTS public.analytics_events;
-- COMMIT;
-- ---------------------------------------------------------------------------
