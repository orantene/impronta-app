-- Reservations — drop three SELECT policies that can no longer fire, so the
-- schema says one thing and a future grant fails CLOSED.
--
-- WHAT 20261229000384 LEFT BEHIND. Revoking ALL from PUBLIC, anon and
-- authenticated took away the grant those policies sat on. A policy without a
-- grant is unreachable: `authenticated` cannot SELECT these tables at all now,
-- and `..._select_staff` never runs. Measured, not assumed —
-- has_table_privilege('authenticated', ..., 'SELECT') is false on all three
-- while the policy is still listed in pg_policies.
--
-- WHY THAT IS WORSE THAN IT LOOKS, AND WHY IT IS NOT MERELY TIDYING.
-- A reader running `\d` or querying pg_policies sees a SELECT policy for
-- authenticated and concludes staff can read the table. They cannot. That is
-- the "documented as wired, resolves to nothing" shape this repo keeps
-- recording, in the schema rather than in code.
--
-- And it is a LATENT RE-OPENER. Supabase's default privileges re-grant ALL on
-- `public` tables in several ordinary situations. The moment a grant comes back
-- — by default privileges, by a later migration, by someone restoring access to
-- a neighbouring table with a broad statement — this policy fires immediately
-- and opens tenant-staff reads that nobody reviewed at that moment. Dropping it
-- means the same event opens NOTHING, because there is no policy and RLS
-- default-deny holds. Fail closed.
--
-- WHAT IF STAFF NEED TO READ THESE LATER? Then it is a deliberate two-step: add
-- the grant AND add the policy, reviewed together, which is the shape that
-- makes the access visible. Today nothing needs it: every read goes through
-- lib/reservations/store.ts with the service role, and the settings page is a
-- server component that already holds the rows.
--
-- customer_payment_methods is untouched here — it never had a policy, which was
-- correct: the host stand needs to know a card EXISTS, which is a boolean the
-- server computes, not a row anyone reads.
--
-- VERIFY WITH pg_policies AFTER APPLYING, not with the absence of an error.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

DROP POLICY IF EXISTS venue_service_windows_select_staff
  ON public.venue_service_windows;
DROP POLICY IF EXISTS venue_service_window_exceptions_select_staff
  ON public.venue_service_window_exceptions;
DROP POLICY IF EXISTS venue_service_rules_select_staff
  ON public.venue_service_rules;

COMMIT;
