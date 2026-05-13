-- F.13 — Roster import job tracking.
--
-- Lets agency admins upload a CSV/Excel of existing talent + the
-- system processes it in the background (creates talent_profiles +
-- agency_talent_roster rows). Progress is visible while the job runs;
-- failure rows can be inspected + retried.
--
-- The actual file parser + row applier is a separate process (the
-- worker / Edge Function); this table is the contract.

BEGIN;

CREATE TABLE IF NOT EXISTS public.roster_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  initiated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Original upload metadata.
  source_file_name TEXT,
  source_file_size_bytes INTEGER,
  source_format TEXT
    CHECK (source_format IN ('csv', 'xlsx', 'xls', 'json', 'manual')),
  -- Stored in private storage (bucket: roster-imports). NULL when the
  -- job is built from inline JSON (e.g. paste-as-text).
  storage_path TEXT,
  -- Lifecycle.
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  -- Stats (filled by worker as it processes).
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  succeeded_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  -- Per-row error detail. Shape: [{ row: 1, error: "...", values: {...} }, ...]
  failure_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Free-form note shown in the UI (e.g. "Migrated from Sheet Y").
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roster_import_jobs_tenant
  ON public.roster_import_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roster_import_jobs_running
  ON public.roster_import_jobs (status, started_at DESC)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.roster_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roster_import_jobs_staff_all ON public.roster_import_jobs;
CREATE POLICY roster_import_jobs_staff_all ON public.roster_import_jobs
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

COMMENT ON TABLE public.roster_import_jobs IS
  'F.13 — Background roster import jobs. Agency uploads a CSV/Excel and the worker creates talent_profiles + agency_talent_roster rows. Progress + failures live here.';

COMMIT;
