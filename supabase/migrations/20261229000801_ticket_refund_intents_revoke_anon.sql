-- Ledger reconciliation (defects-close, 2026-09-11; D-014 / D-103, "the
-- from-zero replay, four historical files").
--
-- Production's ledger records this version as `applied_via_management_api`
-- with no body stored. It is the ORIGINAL stamp of
-- `20261229000808_ticket_refund_intents_revoke_anon.sql`: commit ca5f5d4c9
-- renumbered …801 to …808 ("above the shadowed …800 stamp") after production
-- had already recorded …801, and production later recorded …808 as well.
-- The effect is the sibling's; this file re-asserts the same grant state
-- only when the table exists. On a database built from the repo the table is
-- created by …807, which sorts AFTER this file, so the guard makes this a
-- notice, and …808 does the work in its turn.
DO $$
BEGIN
  IF to_regclass('public.ticket_refund_intents') IS NULL THEN
    RAISE NOTICE '20261229000801: ticket_refund_intents not yet created; 20261229000808 applies this grant state';
    RETURN;
  END IF;
  EXECUTE 'REVOKE ALL ON TABLE public.ticket_refund_intents FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public.ticket_refund_intents FROM anon';
  EXECUTE 'GRANT SELECT ON TABLE public.ticket_refund_intents TO authenticated';
END $$;
