-- Ledger reconciliation (defects-close, 2026-09-11; D-014 / D-103, "the
-- from-zero replay, four historical files").
--
-- Production's ledger records this version as `applied_via_management_api`
-- with no body stored. It is the ORIGINAL stamp of
-- `20261229000809_ticket_refund_intents_authenticated_select_only.sql`
-- (renumbered by commit ca5f5d4c9 after production had recorded …802;
-- production later recorded …809 too). Same guard and same reasoning as
-- 20261229000801: a no-op notice until the table exists, the sibling's
-- grant state otherwise. GRANT/REVOKE are idempotent.
DO $$
BEGIN
  IF to_regclass('public.ticket_refund_intents') IS NULL THEN
    RAISE NOTICE '20261229000802: ticket_refund_intents not yet created; 20261229000809 applies this grant state';
    RETURN;
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE public.ticket_refund_intents FROM authenticated';
  EXECUTE 'GRANT SELECT ON TABLE public.ticket_refund_intents TO authenticated';
END $$;
