-- Removes the coordinator_join_requests scaffolding that
-- 20260615200003.pre.sql had to put back — but only if
-- 20261027000002_drop_coordinator_join_requests has already been applied, in
-- which case production does not have the table and neither should this
-- database. See the .pre.sql header for why the two migrations end up in the
-- wrong order here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
     WHERE version = '20261027000002'
  ) THEN
    DROP TABLE IF EXISTS public.coordinator_join_requests CASCADE;
  END IF;
END $$;

-- Same condition for the helper function the policies call: gone from
-- production once 20261027000002 has run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
     WHERE version = '20261027000002'
  ) THEN
    DROP FUNCTION IF EXISTS public.coord_request_can_approve(uuid, uuid);
  END IF;
END $$;
