-- Cron liveness: a heartbeat per money job, so a job that STOPS is detectable.
--
-- THE GAP THIS CLOSES. `ingest-balance-transactions` and `project-ledger` are
-- the only writers of the books. Both alert loudly when they FAIL — Sentry on a
-- failed ingest, Sentry on a refused projection. Neither can alert when it does
-- not RUN AT ALL: a job that never starts emits nothing, and silence is exactly
-- what a healthy run also looks like.
--
-- So today the ledger could quietly stop being written and the first symptom
-- would be someone noticing, at some later date, that the books end abruptly.
-- That is discovery at audit time rather than incident time, on the one system
-- whose entire job is to be trustworthy after the fact.
--
-- A heartbeat inverts it: absence of a recent row becomes the signal.
--
-- SHAPE. One row per job, upserted — not an append-only log. The question this
-- answers is "when did this job last run, and did it work", which is a current
-- fact, not a history. Run history already exists in Vercel's logs and in the
-- structured `improntaLog` lines; duplicating it here would grow forever to
-- answer a question nothing asks.

CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  job              TEXT PRIMARY KEY,
  -- Every completed run, success or failure. Staleness is measured from here,
  -- because a job that runs and fails is still ALIVE and is a different alarm
  -- (the job's own Sentry alert) from a job that has stopped.
  last_run_at      TIMESTAMPTZ NOT NULL,
  -- Only successful runs. `last_run_at` far ahead of `last_ok_at` means the job
  -- is running and failing every time, which no staleness check would catch.
  last_ok_at       TIMESTAMPTZ,
  last_status      TEXT NOT NULL CHECK (last_status IN ('ok', 'error')),
  -- Short human summary of the last run (counts, or the error). Capped so a
  -- runaway error string cannot bloat the row.
  last_detail      TEXT CHECK (last_detail IS NULL OR length(last_detail) <= 2000),
  -- Consecutive failures. Reset to 0 on success.
  consecutive_failures INT NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cron_heartbeats IS
  'One row per scheduled job: when it last completed and whether it worked. Absence of a recent row is the alarm — a job that stops running cannot report that it stopped.';

-- Service-role only. These rows are written by cron routes running under the
-- service key and read by the alert sweep; no end user has any business seeing
-- or touching them, and a tenant-scoped policy would be meaningless for a
-- platform-global table.
ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cron_heartbeats FROM PUBLIC;
-- Both halves. Supabase attaches EXPLICIT grants to anon/authenticated, so
-- `REVOKE ... FROM PUBLIC` alone leaves those standing.
REVOKE ALL ON public.cron_heartbeats FROM anon, authenticated;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.cron_heartbeats', 'SELECT')
     OR has_table_privilege('authenticated', 'public.cron_heartbeats', 'SELECT') THEN
    RAISE EXCEPTION 'cron_heartbeats is still readable by anon/authenticated';
  END IF;
END $$;
