-- anon holds INSERT/UPDATE/DELETE on 240 public tables. Take them away, and stop
-- new tables arriving with them.
--
-- NOT AN ACTIVE BREACH. RLS is enabled on all 285 public tables with no
-- exceptions, so anon writes are already refused by default-deny. This is
-- defence in depth: one accidentally permissive policy, or one DISABLE ROW
-- LEVEL SECURITY, and the grant is what decides.
--
-- ─── THREE THINGS THAT MAKE THIS DANGEROUS TO WRITE FROM MEMORY ─────────────
--
-- 1. `REVOKE ... FROM PUBLIC` IS THE NO-OP HERE, and `FROM anon` is what works.
--    That is the opposite of this repo's recorded incident, which is about
--    FUNCTIONS: Postgres grants EXECUTE to PUBLIC on new functions by default
--    (600 of our 707 public functions carry it that way), so revoking from a
--    role was the no-op there. Postgres grants NOTHING on tables to PUBLIC.
--    Measured before writing this: PUBLIC appears in ZERO rows of
--    information_schema.role_table_grants for schema public. The two object
--    types default OPPOSITELY, so check the grant table before writing either.
--
-- 2. NEVER REVOKE SELECT. 255 tables carry anon SELECT and the public site
--    reads with the anon key -- directory, talent pages, CMS, every public
--    page -- behind permissive RLS. A blanket REVOKE ALL would take the whole
--    public surface down while reading in review as the more conservative
--    choice.
--
-- 3. NEVER REVOKE `authenticated` WRITES. 240 tables carry them and the app
--    writes as `authenticated` for every signed-in user behind permissive RLS.
--    Removing the grant fails those writes even where the policy allows them.
--    A revoke aimed at PUBLIC that actually worked would have stripped both
--    roles at once -- the version that looks safest and is worst.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- The durable half. Without this we do the revoke again in a month, because
-- every CREATE TABLE inherits the default.
--
-- ALTER DEFAULT PRIVILEGES is keyed on the GRANTING role, and this database has
-- TWO of them for public tables -- `postgres` and `supabase_admin`. Naming only
-- one leaves the other's future tables still granting to anon. `supabase_admin`
-- may not be alterable from the migration role; that is expected rather than a
-- failure, so it is attempted and reported instead of aborting the migration.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
         || 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon';
    RAISE NOTICE 'default privileges: postgres OK';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'default privileges: could not alter FOR ROLE postgres (%)', SQLERRM;
  END;

  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public '
         || 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon';
    RAISE NOTICE 'default privileges: supabase_admin OK';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'default privileges: could not alter FOR ROLE supabase_admin (%) '
                  '-- tables created by that role will still grant anon writes', SQLERRM;
  END;
END $$;

-- ─── PROVE IT, rather than trusting the absence of an error ─────────────────
-- has_table_privilege, not "the REVOKE did not throw". A no-op REVOKE does not
-- throw either, which is exactly how the wrong version of this migration would
-- have read as a fix.
DO $$
DECLARE
  anon_writes  int;
  anon_select  int;
  authed_write int;
BEGIN
  SELECT count(*) INTO anon_writes FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
     AND (has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE'));

  SELECT count(*) INTO anon_select FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
     AND has_table_privilege('anon', c.oid, 'SELECT');

  SELECT count(*) INTO authed_write FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
     AND (has_table_privilege('authenticated', c.oid, 'INSERT')
       OR has_table_privilege('authenticated', c.oid, 'UPDATE')
       OR has_table_privilege('authenticated', c.oid, 'DELETE'));

  IF anon_writes <> 0 THEN
    RAISE EXCEPTION 'anon still holds writes on % tables', anon_writes;
  END IF;

  -- The two assertions that prove the site still works. A migration that only
  -- checked "anon writes are gone" would pass having taken the product down.
  IF anon_select < 250 THEN
    RAISE EXCEPTION 'anon SELECT collapsed to % -- the public site reads with this role', anon_select;
  END IF;
  IF authed_write < 230 THEN
    RAISE EXCEPTION 'authenticated writes collapsed to % -- every signed-in write would fail', authed_write;
  END IF;

  RAISE NOTICE 'anon writes=% (expect 0), anon select=% (expect ~255), authenticated writes=% (expect ~240)',
    anon_writes, anon_select, authed_write;
END $$;

-- ─── MEASURED RESULT, INCLUDING WHAT THIS DOES NOT COVER ────────────────────
--
--   anon writes           237 -> 0
--   anon SELECT           253 -> 253   (unchanged; the public site still reads)
--   authenticated writes  236 -> 236   (unchanged; signed-in writes still work)
--
--   default privileges, granting role `postgres`:
--       anon=arwdDxtm  ->  anon=rxtm     (INSERT/UPDATE/DELETE/TRUNCATE gone)
--
--   default privileges, granting role `supabase_admin`:
--       anon=arwdDxtm  ->  UNCHANGED
--
-- THE GAP, STATED RATHER THAN GLOSSED: the migration role is not a member of
-- `supabase_admin`, so that role's default privileges could not be altered and
-- the attempt was caught as a warning. Tables created BY `supabase_admin` will
-- still arrive granting anon writes. Migrations here run as `postgres`, so the
-- path we actually use is covered -- but this is not total, and a partial fix
-- that reads as complete is the thing this migration exists to argue against.
-- Closing it needs someone who can act as `supabase_admin`.
