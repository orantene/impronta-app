-- 20260919000000_schema_drift_rpc.sql
--
-- Exposes two SECURITY DEFINER RPCs used by the schema-drift CI check
-- (web/scripts/check-schema-drift.ts) so the script can query the real
-- information_schema regardless of column-level grants or PostgREST exposure.
--
-- The PostgREST OpenAPI spec only returns columns granted to the
-- `authenticated` role; many internal columns are intentionally not granted.
-- These functions let the check script see ALL columns in the `public` schema,
-- which is what we want for drift detection.
--
-- Both functions are service-role only — no anon/authenticated access.

BEGIN;

-- ── list_public_tables ──────────────────────────────────────────────────────
-- Returns all table and view names in the `public` schema.

CREATE OR REPLACE FUNCTION public.list_public_tables()
RETURNS TABLE (table_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = information_schema, pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
    SELECT t.table_name::TEXT
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY t.table_name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_tables() TO service_role;

COMMENT ON FUNCTION public.list_public_tables() IS
  '20260919 — returns table/view names in the public schema. '
  'Service-role only. Used by check-schema-drift.ts CI check.';


-- ── list_public_columns ─────────────────────────────────────────────────────
-- Returns all column names (table_name, column_name) in the `public` schema.
-- Includes columns not exposed via PostgREST grants.

CREATE OR REPLACE FUNCTION public.list_public_columns()
RETURNS TABLE (table_name TEXT, column_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = information_schema, pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
    SELECT c.table_name::TEXT, c.column_name::TEXT
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position;
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_columns() TO service_role;

COMMENT ON FUNCTION public.list_public_columns() IS
  '20260919 — returns (table_name, column_name) for every column in the public '
  'schema, including columns not granted to authenticated. Service-role only. '
  'Used by check-schema-drift.ts CI check.';

COMMIT;
