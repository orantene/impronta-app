-- =============================================================================
-- platform_alerts table + usage_audit_metrics() RPC
-- =============================================================================
--
-- Built for the weekly usage-audit cron (/api/cron/usage-audit). Captures
-- Supabase-resource usage signals (storage, DB size, oversized media,
-- orphaned media rows) and stores any WARN/CRITICAL findings as durable
-- audit-trail rows the user can query.
--
-- Why both pieces in one migration:
-- The cron route calls `rpc('usage_audit_metrics')` to fetch raw metrics
-- (cross-schema SQL into `storage.objects` + pg_database_size, neither
-- of which is exposed via PostgREST). It then classifies + writes any
-- alerts into `platform_alerts` via the standard supabase-js client.
-- Keeping the function SECURITY DEFINER lets the service-role caller
-- read storage.objects without needing direct privilege grants.
--
-- Idempotency contract:
-- `platform_alerts` has UNIQUE (audit_date, category, content_hash) —
-- re-running the cron on the same day with the same metric values is a
-- no-op (ON CONFLICT DO NOTHING). Different day OR drifted metrics
-- inserts a new row.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) platform_alerts — durable audit trail of usage-audit findings.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  severity TEXT NOT NULL CHECK (severity IN ('warn', 'critical')),
  category TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (day, category, exact content) — re-running same audit = no-op.
CREATE UNIQUE INDEX IF NOT EXISTS platform_alerts_dedupe_idx
  ON public.platform_alerts (audit_date, category, content_hash);

CREATE INDEX IF NOT EXISTS platform_alerts_created_at_idx
  ON public.platform_alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS platform_alerts_severity_idx
  ON public.platform_alerts (severity, created_at DESC);

ALTER TABLE public.platform_alerts ENABLE ROW LEVEL SECURITY;

-- No general policy: only service-role (bypass-RLS) can read/write. This is a
-- platform-operator table, not user-facing data. Surface via admin tools later.

COMMENT ON TABLE public.platform_alerts IS
  'Platform-operator alert log (usage-audit cron findings). service-role only.';

-- ---------------------------------------------------------------------------
-- 2) usage_audit_metrics() — one-shot metrics fetch for the audit cron.
-- ---------------------------------------------------------------------------
-- Returns a JSON object:
--   {
--     "db_bytes": <bigint>,
--     "storage_buckets": [ { "bucket_id": "...", "bytes": <bigint>, "objects": <int> }, ... ],
--     "storage_total_bytes": <bigint>,
--     "large_media_count": <int>,        -- media_assets rows > 250KB (not deleted)
--     "orphan_media_count": <int>        -- media_assets pointing at no storage.object
--   }
--
-- SECURITY DEFINER so the service-role caller can read storage.objects via SQL
-- without needing direct schema-level grants. Set search_path defensively.
CREATE OR REPLACE FUNCTION public.usage_audit_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_db_bytes BIGINT;
  v_storage_buckets JSONB;
  v_storage_total_bytes BIGINT;
  v_large_media_count INT;
  v_orphan_media_count INT;
BEGIN
  -- DB size (entire current database)
  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  -- Per-bucket storage usage + total
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'bucket_id', bucket_id,
          'bytes',     bytes,
          'objects',   objects
        )
        ORDER BY bytes DESC
      ),
      '[]'::jsonb
    ),
    COALESCE(SUM(bytes), 0)::bigint
  INTO v_storage_buckets, v_storage_total_bytes
  FROM (
    SELECT
      bucket_id,
      SUM(COALESCE((metadata->>'size')::bigint, 0))::bigint AS bytes,
      COUNT(*)::int                                          AS objects
    FROM storage.objects
    GROUP BY bucket_id
  ) AS per_bucket;

  -- Large media_assets rows (>250KB) — backfill candidates.
  -- COALESCE between the older `file_size` column and the newer
  -- `file_size_bytes` column (both populated depending on era).
  SELECT COUNT(*)::int
  INTO v_large_media_count
  FROM public.media_assets
  WHERE deleted_at IS NULL
    AND COALESCE(file_size_bytes, file_size, 0) > 256000; -- 250 KB ~= 256000 bytes

  -- Orphan media_assets — DB row with no matching storage.object.
  SELECT COUNT(*)::int
  INTO v_orphan_media_count
  FROM public.media_assets ma
  WHERE ma.deleted_at IS NULL
    AND ma.storage_path IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM storage.objects so
      WHERE so.bucket_id = ma.bucket_id
        AND so.name      = ma.storage_path
    );

  RETURN jsonb_build_object(
    'db_bytes',            v_db_bytes,
    'storage_buckets',     v_storage_buckets,
    'storage_total_bytes', v_storage_total_bytes,
    'large_media_count',   v_large_media_count,
    'orphan_media_count',  v_orphan_media_count,
    'collected_at',        now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.usage_audit_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usage_audit_metrics() TO service_role;

COMMENT ON FUNCTION public.usage_audit_metrics() IS
  'Returns Supabase usage metrics for the weekly /api/cron/usage-audit job.';
