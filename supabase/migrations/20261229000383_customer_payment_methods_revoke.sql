-- Reservations R5 — take back the grants Supabase hands out by default.
--
-- WHY THIS IS A SECOND FILE AND NOT AN EDIT TO ...382.
-- ...382 has already run against production. A migration file must not disagree
-- with the database it produced, or the next person rebuilding from scratch
-- gets a different schema from the one we are running.
--
-- WHAT WAS WRONG. Supabase's default privileges on `public` grant ALL to `anon`
-- and `authenticated` on every new table, so `customer_payment_methods` arrived
-- with `has_table_privilege('anon', ..., 'SELECT') = true`. Measured after
-- applying ...382, not assumed.
--
-- No rows were exposed: RLS is enabled with ZERO policies, so every select
-- returns nothing regardless of the grant. This is defence in depth rather than
-- remediation. But a table whose only sanctioned reader is the service role
-- should not advertise SELECT to anon, and the default grant is ALL — so anon
-- and authenticated also arrived holding INSERT, UPDATE and DELETE on a table
-- of payment-method handles. Those were already dead against RLS. They should
-- not be listed at all.
--
-- Unlike `capacity_pools`, NOTHING is granted back. Staff never read this table:
-- the host stand needs to know a card EXISTS, which is a boolean the server
-- computes, not the row. There is no reader here but the service role.
--
-- `REVOKE ... FROM anon` alone is a NO-OP against a grant made to PUBLIC —
-- `FROM PUBLIC` is the operative clause, which is the hole 20261124000000 was
-- written to close. Both are named here for that reason.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

REVOKE ALL ON TABLE public.customer_payment_methods FROM PUBLIC, anon, authenticated;

COMMIT;
