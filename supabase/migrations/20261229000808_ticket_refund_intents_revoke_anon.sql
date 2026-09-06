-- E5 step 1 — `ticket_refund_intents` has no anon surface. RLS already
-- refuses (no anon policy), but the default table grant to anon is the outer
-- door and should not exist. REVOKE FROM PUBLIC as well as anon: a grant
-- inherited through PUBLIC survives a plain `REVOKE FROM anon` (recorded
-- lesson). `authenticated` keeps SELECT for the staff policy; the service
-- role writes and executes.

BEGIN;
REVOKE ALL ON TABLE public.ticket_refund_intents FROM PUBLIC;
REVOKE ALL ON TABLE public.ticket_refund_intents FROM anon;
GRANT SELECT ON TABLE public.ticket_refund_intents TO authenticated;
COMMIT;
