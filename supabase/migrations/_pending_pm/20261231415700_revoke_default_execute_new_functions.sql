-- 20261231415700_revoke_default_execute_new_functions.sql
--
-- HELD (supabase/migrations/_pending_pm/). NOT APPLIED ANYWHERE. TUL-1269 #6
-- systemic, package I2. PM moves it into supabase/migrations/ and pushes it.
--
-- WHAT IT CHANGES
--   New functions that the `postgres` role creates (every migration here runs
--   as postgres; staging 2026-10-19: all 483 non-extension functions in
--   `public` are owned by postgres) are no longer EXECUTE-able by PUBLIC, anon
--   or authenticated by default. service_role keeps its default grant in
--   `public`, and the owner can always execute its own functions.
--
-- WHY TWO STATEMENTS FOR PUBLIC
--   Postgres grants EXECUTE on every new function to PUBLIC as a GLOBAL
--   default. Per-schema default privileges are ADDED to the global ones, so
--   `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ... FROM PUBLIC` alone is
--   a no-op: anon and authenticated would still inherit EXECUTE through PUBLIC.
--   The PUBLIC revoke therefore has to be global (FOR ROLE postgres, no schema),
--   and the anon/authenticated revoke is per-schema because that is where
--   Supabase's own default grant to them lives (pg_default_acl: postgres,
--   public, f = {postgres, anon, authenticated, service_role}).
--
-- WHY THE extensions SCHEMA IS RESTORED
--   postgres owns pgcrypto, uuid-ossp and pg_stat_statements in `extensions`.
--   A future CREATE EXTENSION / ALTER EXTENSION UPDATE run as postgres would
--   otherwise create functions nobody but postgres can call, and a column
--   default such as extensions.gen_random_bytes() is evaluated with the
--   INSERTING role's privileges. The per-schema GRANT below keeps today's
--   behaviour there. No postgres-owned non-extension functions live outside
--   `public` today (staging read, 2026-10-19).
--
-- EFFECT ON EXISTING FUNCTIONS: NONE. Default privileges apply only to objects
--   created after this runs. `CREATE OR REPLACE FUNCTION` on an existing
--   signature keeps that function's current ACL.
--
-- EFFECT ON FUTURE MIGRATIONS (they must GRANT explicitly):
--   * A NEW function (a new name OR a changed argument list, because DROP +
--     CREATE makes a new object) is callable only by its owner and
--     service_role until the migration says otherwise:
--         GRANT EXECUTE ON FUNCTION public.f(args) TO authenticated;
--     and, only for a reviewed public surface, TO anon.
--   * This includes functions Postgres calls on the user's behalf: RLS policy
--     helpers, SECURITY INVOKER functions used in views, and column DEFAULT
--     expressions. Without the grant the query fails with "permission denied
--     for function" for that role.
--   * Trigger functions need nothing: EXECUTE is checked at CREATE TRIGGER
--     time against the creator (postgres), not when the trigger fires.
--   * The CI guard (web/scripts/lib/function-execute-guard*.mjs, Local
--     Supabase job) is the other half: a new function granted to anon or
--     authenticated must also be added to the reviewed allow-list.
--
-- IDEMPOTENT: ALTER DEFAULT PRIVILEGES sets state; running it twice is the
-- same as running it once.
--
-- ROLLBACK (restores today's defaults):
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA extensions
--     REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 1. Global: no implicit EXECUTE to PUBLIC on functions postgres creates.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 2. public: drop Supabase's default grant to anon and authenticated.
--    service_role is deliberately NOT named, so its default grant stays.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- 3. extensions: keep today's behaviour for extension functions postgres owns.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA extensions
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
