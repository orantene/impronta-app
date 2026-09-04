-- Reservations — take back the grants Supabase hands out by default, on the
-- three tables R1 created before I had the habit.
--
-- WHAT WAS MEASURED, in production, with has_table_privilege rather than
-- inferred from the absence of an error:
--
--   venue_service_windows            anon: SELECT INSERT UPDATE DELETE
--   venue_service_window_exceptions  anon: SELECT INSERT UPDATE DELETE
--   venue_service_rules              anon: SELECT INSERT UPDATE DELETE
--
-- `authenticated` held DELETE on all three as well.
--
-- NOT AN ACTIVE BREACH. Each has RLS enabled with exactly one policy — SELECT,
-- for `authenticated` — so anon reads and every anon write are already refused
-- by default-deny. This is defence in depth.
--
-- BUT THE GRANT IS ONE MISTAKE AWAY FROM BEING LIVE. One accidentally permissive
-- policy, or one `DISABLE ROW LEVEL SECURITY` during an incident, and anon can
-- delete a restaurant's service windows. Nobody adding a policy later will think
-- to check the grant underneath it, because a policy reads like the whole
-- access-control story and here it is only half of it.
--
-- `REVOKE ... FROM anon` IS A NO-OP AND READS EXACTLY LIKE A FIX.
-- anon inherits through PUBLIC, so revoking from the role alone changes nothing
-- while looking correct in a diff. `FROM PUBLIC` is the operative clause. This
-- is the hole 20261124000000 was written to close, met again through a
-- different door.
--
-- NOTHING IS GRANTED BACK. These tables are read through the server with the
-- service role; the `authenticated` SELECT policy stays and is unaffected by the
-- grant, because a policy without a grant is simply unreachable and this table
-- has no browser reader.
--
-- HOW THIS WAS FOUND. Applying 20261229000382 and then running
-- has_table_privilege on it — rather than stopping at to_regclass — turned up
-- the same thing on a table of payment-method handles. The Director repeated
-- the check across all ten tables this cluster has created. Existence is not
-- correctness, and neither is RLS-is-on.
--
-- VERIFY WITH has_table_privilege AFTER APPLYING. A revoke that silently does
-- nothing is the failure this file exists to fix, so the absence of an error
-- proves nothing here.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

REVOKE ALL ON TABLE public.venue_service_windows
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.venue_service_window_exceptions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.venue_service_rules
  FROM PUBLIC, anon, authenticated;

COMMIT;
