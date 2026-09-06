-- Internal analytics: events, rollups, funnel steps, KPI snapshots, API response cache (GA4/GSC).
--
-- ============================================================================
-- THIS FILE HAS NEVER APPLIED TO PRODUCTION AND CANNOT APPLY AS NUMBERED.
-- Verified 2026-09-06 by query, not by reading a migration:
--   supabase_migrations.schema_migrations has version 20260413120000 recorded
--   under the name `multilingual_talent_bio`. A DIFFERENT migration took this
--   version first, so `db push` treats this one as already applied and skips it
--   forever. `db:check` reports green because it matches on the version prefix
--   only. On production, `analytics_funnel_steps` and `analytics_search_sessions`
--   DO NOT EXIST (only `analytics_events` does, created by
--   20260625140000_saas_p56_m0_analytics_events_bootstrap.sql), and neither do
--   any of the policies below.
--
-- WHY THAT MATTERED: as originally written, this file granted anonymous callers
--   INSERT on both tables with WITH CHECK (TRUE), and -- worse -- UPDATE on
--   analytics_search_sessions with USING (TRUE) WITH CHECK (TRUE), which would
--   let any anonymous caller REWRITE rows that already existed. Dead as long as
--   the file never runs, but it is a loaded gun: renumbering this file to "fix"
--   the collision (exactly what was just done for another colliding file) would
--   apply it and create the hole. The anon policies below have therefore been
--   replaced with service-role-only writes, so that a future renumber is safe.
--   The live equivalents on analytics_events, search_queries and guest_sessions
--   were closed by 20260906145432_close_anon_insert_on_telemetry_tables.sql.
--
-- Neither table is referenced anywhere in web/src (zero hits, including the
-- generated database.types.ts). If they are still unwanted, delete this file
-- rather than renumbering it.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- analytics_events — append-only product/business events (survives ad blockers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id TEXT,
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  talent_id UUID REFERENCES public.talent_profiles (id) ON DELETE SET NULL,
  path TEXT,
  locale TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON public.analytics_events (name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_talent
  ON public.analytics_events (talent_id, created_at DESC)
  WHERE talent_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_events_insert_public ON public.analytics_events;
CREATE POLICY analytics_events_insert_public ON public.analytics_events
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS analytics_events_select_staff ON public.analytics_events;
CREATE POLICY analytics_events_select_staff ON public.analytics_events
  FOR SELECT
  USING (public.is_agency_staff());

-- ---------------------------------------------------------------------------
-- analytics_daily_rollups — pre-aggregated dimension buckets (optional nightly job)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_daily_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_date DATE NOT NULL,
  dimension_key TEXT NOT NULL,
  dimension_value TEXT NOT NULL DEFAULT '',
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket_date, dimension_key, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_rollups_date
  ON public.analytics_daily_rollups (bucket_date DESC);

ALTER TABLE public.analytics_daily_rollups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_daily_rollups_select_staff ON public.analytics_daily_rollups;
CREATE POLICY analytics_daily_rollups_select_staff ON public.analytics_daily_rollups
  FOR SELECT
  USING (public.is_agency_staff());

DROP POLICY IF EXISTS analytics_daily_rollups_service ON public.analytics_daily_rollups;
CREATE POLICY analytics_daily_rollups_service ON public.analytics_daily_rollups
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- ---------------------------------------------------------------------------
-- analytics_funnel_steps — session-scoped funnel progression
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_funnel_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  step TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_funnel_steps_session
  ON public.analytics_funnel_steps (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_funnel_steps_step_created
  ON public.analytics_funnel_steps (step, created_at DESC);

ALTER TABLE public.analytics_funnel_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_funnel_steps_insert_public ON public.analytics_funnel_steps;
CREATE POLICY analytics_funnel_steps_insert_public ON public.analytics_funnel_steps
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS analytics_funnel_steps_select_staff ON public.analytics_funnel_steps;
CREATE POLICY analytics_funnel_steps_select_staff ON public.analytics_funnel_steps
  FOR SELECT
  USING (public.is_agency_staff());

-- ---------------------------------------------------------------------------
-- analytics_search_sessions — optional session stitching for search UX metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  query_count INT NOT NULL DEFAULT 0,
  zero_result_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_analytics_search_sessions_last
  ON public.analytics_search_sessions (last_activity_at DESC);

ALTER TABLE public.analytics_search_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_search_sessions_insert_public ON public.analytics_search_sessions;
CREATE POLICY analytics_search_sessions_insert_public ON public.analytics_search_sessions
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS analytics_search_sessions_update_public ON public.analytics_search_sessions;
CREATE POLICY analytics_search_sessions_update_public ON public.analytics_search_sessions
  FOR UPDATE
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS analytics_search_sessions_select_staff ON public.analytics_search_sessions;
CREATE POLICY analytics_search_sessions_select_staff ON public.analytics_search_sessions
  FOR SELECT
  USING (public.is_agency_staff());

-- ---------------------------------------------------------------------------
-- analytics_kpi_snapshots — cached KPI time series / compare periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'internal'
);

CREATE INDEX IF NOT EXISTS idx_analytics_kpi_snapshots_period_metric
  ON public.analytics_kpi_snapshots (period_start, period_end, metric_key);

ALTER TABLE public.analytics_kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_kpi_snapshots_select_staff ON public.analytics_kpi_snapshots;
CREATE POLICY analytics_kpi_snapshots_select_staff ON public.analytics_kpi_snapshots
  FOR SELECT
  USING (public.is_agency_staff());

DROP POLICY IF EXISTS analytics_kpi_snapshots_service ON public.analytics_kpi_snapshots;
CREATE POLICY analytics_kpi_snapshots_service ON public.analytics_kpi_snapshots
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- ---------------------------------------------------------------------------
-- analytics_api_cache — GA4 Data API / GSC / Realtime JSON cache (quota control)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_api_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  response JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_api_cache_expires
  ON public.analytics_api_cache (expires_at);

ALTER TABLE public.analytics_api_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_api_cache_select_staff ON public.analytics_api_cache;
CREATE POLICY analytics_api_cache_select_staff ON public.analytics_api_cache
  FOR SELECT
  USING (public.is_agency_staff());

DROP POLICY IF EXISTS analytics_api_cache_service ON public.analytics_api_cache;
CREATE POLICY analytics_api_cache_service ON public.analytics_api_cache
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

COMMIT;
