-- P1 money hardening (a) — event-based refund idempotency.
--
-- Why:
-- A partial booking refund is recorded as a linked `refunded` row whose
-- idempotency was previously keyed on (refund_of_transaction_id,
-- gross_amount_cents, status='refunded'). Stripe emits a `charge.refunded`
-- event for EACH refund object on a charge, and `charge.amount_refunded` is
-- CUMULATIVE — so two additive partial refunds ($10 then $20) arrive with
-- different amounts (10, then 30) and each inserted a NEW refund row, causing
-- `reverseBookingPayouts` to claw the workspace leg AGAIN. Amount-based dedup
-- cannot tell a re-delivered event from a genuinely new partial refund.
--
-- Fix: dedup on the Stripe Refund object id (`re_...`), which is stable per
-- refund event and unique per actual refund. We persist it on the refund
-- transaction row in a dedicated column + a UNIQUE index so a re-delivered
-- webhook (same `re_...`) can never insert a second clawing row, while a
-- genuinely new partial refund (new `re_...`) is recorded exactly once.
--
-- The column is nullable: legacy refund rows and the full-refund path that
-- only update the parent row in place (no insert) don't carry one. The unique
-- index is partial (WHERE provider_refund_id IS NOT NULL) so it only enforces
-- on the inserted refund-record rows that set it.

BEGIN;

ALTER TABLE public.booking_transactions
  ADD COLUMN IF NOT EXISTS provider_refund_id TEXT;

COMMENT ON COLUMN public.booking_transactions.provider_refund_id IS
  'Stripe Refund object id (re_...) for an inserted refund-record row. Event-based idempotency key: a re-delivered charge.refunded for the same refund cannot insert a duplicate clawing row. NULL on non-refund rows and legacy refund rows.';

-- One refund-record row per Stripe Refund id (event-based idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_transactions_provider_refund_id
  ON public.booking_transactions (provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

COMMIT;
