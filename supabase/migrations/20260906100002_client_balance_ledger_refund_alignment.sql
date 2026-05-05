-- Phase 8.x corrective — allow refund rows with the same stripe_payment_intent_id
-- as their originating deposit.
--
-- The earlier hardening migration (20260901185000) added a global unique index
-- on `stripe_payment_intent_id` for top-up idempotency. That blocks the H7
-- refund flow which inserts a `refund` ledger row carrying the SAME
-- payment_intent_id as the original deposit. Scope the uniqueness to deposit
-- rows only — refund/debit rows can share the intent id with their deposit.
--
-- Idempotency for refund rows is enforced by the application layer via
-- cumulative-refund computation against the deposit amount.

BEGIN;

DROP INDEX IF EXISTS public.idx_client_balance_ledger_payment_intent_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_balance_ledger_deposit_payment_intent_unique
  ON public.client_balance_ledger (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL AND entry_type = 'deposit';

CREATE INDEX IF NOT EXISTS idx_client_balance_ledger_payment_intent_lookup
  ON public.client_balance_ledger (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMIT;
