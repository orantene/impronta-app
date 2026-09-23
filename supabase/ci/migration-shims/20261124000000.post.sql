-- Removes the release_offering_stock scaffolding 20261124000000.pre.sql had to
-- put back, under the same condition: if 20261229000215_drop_legacy_stock_rpcs
-- has already run, production does not have this function and neither should
-- this database. See the .pre.sql header, PART 2.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
              WHERE version = '20261229000215') THEN
    DROP FUNCTION IF EXISTS public.release_offering_stock(uuid, integer);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
              WHERE version = '20261229000215') THEN
    DROP FUNCTION IF EXISTS public.reserve_offering_stock(uuid, integer);
  END IF;
END $$;
