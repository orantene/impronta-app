-- 20260906031100_integration_grants_and_definer_rpc_hygiene revokes EXECUTE on
-- public.find_taxonomy_assignment_drift() and then ASSERTS with
-- has_function_privilege('anon', 'public.find_taxonomy_assignment_drift()',
-- 'EXECUTE'). No migration in supabase/migrations/ ever creates that function:
-- it was created out of band in production (the migration's own header says
-- "NO caller in the repo"), so from scratch the REVOKE fails with
-- "function public.find_taxonomy_assignment_drift() does not exist".
--
-- Recreated here from the only evidence the repo holds:
--   * web/src/lib/supabase/database.types.ts (generated FROM production)
--     records Args: never and Returns: {talent_profile_id, taxonomy_term_id,
--     term_type, relationship_type, reason}[] — a zero-argument set-returning
--     function with those five columns.
--   * The migration lists it among "Nine SECURITY DEFINER functions executable
--     by anon", so it is SECURITY DEFINER and still carries the default
--     PUBLIC EXECUTE grant when the migration runs — which is exactly what
--     makes the REVOKE meaningful and the assertion able to fail.
--
-- THE BODY IS NOT REPRODUCED AND CANNOT BE: it exists only inside production
-- and no file in this repo records it. What this stand-in reproduces is the
-- function's IDENTITY and PRIVILEGES — the only things 20260906031100 touches.
-- It returns no rows. Nothing in web/src calls it, so nothing downstream reads
-- a wrong answer. If a caller is ever added, this stand-in must be replaced by
-- the real definition (dump it from production and commit it as a migration).
DO $$
BEGIN
  IF to_regprocedure('public.find_taxonomy_assignment_drift()') IS NOT NULL THEN
    RETURN;
  END IF;
  EXECUTE $fn$
    CREATE FUNCTION public.find_taxonomy_assignment_drift()
    RETURNS TABLE (
      talent_profile_id uuid,
      taxonomy_term_id  uuid,
      term_type         text,
      relationship_type text,
      reason            text
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
      -- CI stand-in: see this shim's header. Production's body is out of band.
      SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text
      WHERE false
    $body$
  $fn$;
END $$;
