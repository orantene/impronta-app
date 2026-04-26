-- Phase B.2.B (M17) — applied-migrations RPC.
--
-- Exposes `supabase_migrations.schema_migrations.version` to service-role
-- callers via a SECURITY DEFINER function in the `public` schema. Used
-- by the build-time migration-drift safeguard
-- (web/scripts/check-migrations-applied.mjs) so any deploy with pending
-- migrations fails fast, regardless of whether the build environment has
-- supabase CLI / `supabase link` set up.
--
-- Read-only. Returns at most ~hundreds of rows. No-op for any caller
-- without service-role.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_applied_migrations()
RETURNS TABLE (version TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
    SELECT m.version::TEXT
    FROM supabase_migrations.schema_migrations m
    ORDER BY m.version ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_applied_migrations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_applied_migrations() TO service_role;

COMMENT ON FUNCTION public.list_applied_migrations() IS
  'Phase B.2.B — returns the YYYYMMDDHHMMSS prefix of each migration applied to this Supabase project. Service-role only. Used by the build-time migration-drift safeguard so deploys fail fast when local migration files are not yet applied to the remote DB.';

COMMIT;
