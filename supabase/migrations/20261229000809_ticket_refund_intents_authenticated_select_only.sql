-- E5 step 1 — `authenticated` holds SELECT only on `ticket_refund_intents`.
-- `…801` granted SELECT to authenticated but did not revoke the default
-- table grant (arwdDxtm) Supabase gives authenticated on a new public table;
-- the catalog showed `authenticated=arwdDxtm/postgres`. RLS (one SELECT
-- policy) already refuses writes, but the grant is the outer door: intents
-- are written by the service role in the paid hook and by the cron, never by
-- a signed-in user.
BEGIN;
REVOKE ALL ON TABLE public.ticket_refund_intents FROM authenticated;
GRANT SELECT ON TABLE public.ticket_refund_intents TO authenticated;
COMMIT;
