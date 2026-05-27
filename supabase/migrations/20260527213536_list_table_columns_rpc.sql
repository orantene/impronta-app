-- L53 — Introspection helper for the migration column-name lint.
--
-- Exposes information_schema.columns (public schema only) via a SECURITY
-- DEFINER RPC so the lint script (web/scripts/lint-migration-columns.mjs)
-- can introspect the live schema with just the service-role key — no
-- direct schema access required.
--
-- Mirrors the pattern from 20260708120000_phase_b2b_list_applied_migrations_rpc.sql.

CREATE OR REPLACE FUNCTION public.list_table_columns()
RETURNS TABLE(table_name text, column_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    c.table_name::text,
    c.column_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  ORDER BY c.table_name, c.ordinal_position;
$$;

-- Service role + authenticated only. Anon stays excluded.
REVOKE ALL ON FUNCTION public.list_table_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_table_columns() TO service_role;
GRANT EXECUTE ON FUNCTION public.list_table_columns() TO authenticated;

COMMENT ON FUNCTION public.list_table_columns() IS
  'Read-only schema introspection for tooling (e.g. web/scripts/lint-migration-columns.mjs). Returns (table_name, column_name) for every column in the public schema. Service-role + authenticated only.';
