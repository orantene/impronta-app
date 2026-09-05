-- THREE TABLES ANON WRITES TO ON PURPOSE, AND THE SCHEMA-WIDE REVOKE TOOK THEM.
--
-- `20261229000700` revoked anon INSERT/UPDATE/DELETE across `public`. Correct
-- for 234 tables and WRONG for exactly three, whose policies say in their own
-- names that anon writing is the point:
--
--   guest_sessions    guest_sessions_insert_anon      INSERT  WITH CHECK (true)
--   search_queries    search_queries_insert_public    INSERT  WITH CHECK (true)
--   analytics_events  analytics_events_insert_public  INSERT  WITH CHECK (true)
--
-- HOW IT FAILED IS THE POINT. Policy present, grant gone. No 500, no error
-- page, no log line -- guest sessions simply stop being created, search stops
-- logging, analytics goes silent. It surfaces days later as "analytics looks
-- broken", with nobody connecting it to a security migration. That is the exact
-- mirror of the SELECT trap the parent migration was written to avoid, and it
-- was missed because the parent asked "who holds a grant" and never asked
-- "who has a policy that would USE it".
--
-- A POLICY'S ROLE LIST IS NOT ITS PREDICATE. A sweep for write policies naming
-- anon or public returns ~201 tables, which reads as an emergency. 198 of them
-- deny anon by predicate -- they gate on is_active_staff_of_tenant,
-- is_agency_staff or is_talent_profile_owner, all of which resolve through
-- auth.uid() and therefore refuse anon; most name `public` only because they
-- were written without an explicit TO clause. Filtering to trivially-true
-- predicates cuts 201 to 3.
--
-- WHICH GIVES THE REAL FLOOR, AND IT IS STRONGER THAN "RLS IS ON": of the 237
-- tables that carried anon write grants, exactly THREE had a policy that would
-- let anon actually write. The other 234 were grant-without-reach.

GRANT INSERT ON public.guest_sessions   TO anon;
GRANT INSERT ON public.search_queries   TO anon;
GRANT INSERT ON public.analytics_events TO anon;

-- ─── PROVE IT ──────────────────────────────────────────────────────────────
-- anon INSERT must be 3 here. ZERO IS A FAILURE, NOT A SUCCESS -- a reviewer
-- scanning for "0" as the safe number would be reading the outage.
DO $$
DECLARE restored int; leaked int;
BEGIN
  SELECT count(*) INTO restored FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public'
     AND c.relname IN ('guest_sessions','search_queries','analytics_events')
     AND has_table_privilege('anon', c.oid, 'INSERT');

  SELECT count(*) INTO leaked FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p')
     AND c.relname NOT IN ('guest_sessions','search_queries','analytics_events')
     AND (has_table_privilege('anon', c.oid,'INSERT')
       OR has_table_privilege('anon', c.oid,'UPDATE')
       OR has_table_privilege('anon', c.oid,'DELETE'));

  IF restored <> 3 THEN RAISE EXCEPTION 'expected 3 restored anon INSERT grants, got %', restored; END IF;
  IF leaked   <> 0 THEN RAISE EXCEPTION 'the revoke leaked: % other tables still grant anon writes', leaked; END IF;
END $$;

-- MEASURED AFTER BOTH MIGRATIONS:
--   anon INSERT            3    (guest_sessions, search_queries, analytics_events)
--   anon UPDATE/DELETE     0
--   anon SELECT          253    unchanged
--   authenticated writes 236    unchanged
