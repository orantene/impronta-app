-- Staff-only RPC: exact GROUP BY fallback_reason for AI console (replaces large sampled LIMIT in Node).

BEGIN;

CREATE OR REPLACE FUNCTION public.search_queries_fallback_reason_rollup(
  p_since timestamptz,
  p_limit int DEFAULT 25
)
RETURNS TABLE (reason text, cnt bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_agency_staff() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(NULLIF(TRIM(sq.fallback_reason), ''), '(empty)') AS reason,
    COUNT(*)::bigint AS cnt
  FROM public.search_queries sq
  WHERE sq.created_at >= p_since
    AND sq.fallback_triggered IS TRUE
  GROUP BY 1
  ORDER BY cnt DESC
  LIMIT LEAST(COALESCE(p_limit, 25), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.search_queries_fallback_reason_rollup(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_queries_fallback_reason_rollup(timestamptz, int) TO authenticated;

COMMIT;
