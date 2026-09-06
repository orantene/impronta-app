-- Phase 2 · E5 step 1 — `ticket_refund_intents`: a seat lost after payment is
-- recorded in the paid hook and refunded by a separate, inspectable executor.
--
-- WHY A TABLE AND NOT A CALL. `completeOrderForTransaction` re-checks capacity
-- at webhook time and refuses to revive a lapsed hold, then still flips the
-- order to `paid` (its DECISION 2) and fires `onOrderPaid`. The mint runs in
-- that hook. If the mint called the refund executor from there, the hook's
-- deliberate catch-all (`complete-order.ts:225`, right for minting) would turn
-- the one refund outcome that needs a person — `partial_failure` with money
-- moved — into a log line and an `ok`; and a refund issued microseconds after
-- the charge can be refused by Stripe before settlement and vanish the same
-- way. So the hook RECORDS the intent and a cron executes it where the result
-- is inspectable and retryable (Orders' objection, #1805 §5b.0).
--
-- `claimed_at` IS THE DOUBLE-REFUND GUARD, NOT `executed_at`. `executed_at` is
-- written after the refund; a crash between "Stripe refunded" and "row
-- updated", or two overlapping cron runs, would refund twice. The executor
-- claims first with a conditional UPDATE (`WHERE claimed_at IS NULL`) and the
-- loser skips — the same atomic check-and-write that makes
-- `redeem_tenant_promo` correct. A claimed-but-unexecuted intent is visible as
-- exactly that: something to investigate, never something to redo.
--
-- NO anon path. Written by the service role in the paid hook; read and
-- executed by the cron under the service role; staff may read their own
-- tenant's rows (the night report will show them).

BEGIN;

CREATE TABLE IF NOT EXISTS public.ticket_refund_intents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  order_id       uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_line_id  uuid NOT NULL REFERENCES public.order_lines(id) ON DELETE CASCADE,
  reason         text NOT NULL CHECK (reason IN ('seat_lost_after_payment')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  claimed_at     timestamptz,
  executed_at    timestamptz,
  -- The executor's verdict, verbatim from refundOrderLines: ok | refund_refused
  -- | partial_failure | <other>. NULL until executed.
  result         text,
  result_detail  jsonb,
  attempts       int NOT NULL DEFAULT 0,
  CONSTRAINT ticket_refund_intents_one_per_line UNIQUE (order_line_id),
  CONSTRAINT ticket_refund_intents_executed_after_claim
    CHECK (executed_at IS NULL OR claimed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ticket_refund_intents_pending_idx
  ON public.ticket_refund_intents (created_at)
  WHERE executed_at IS NULL;

ALTER TABLE public.ticket_refund_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_refund_intents_select_staff ON public.ticket_refund_intents;
CREATE POLICY ticket_refund_intents_select_staff ON public.ticket_refund_intents
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

COMMENT ON TABLE public.ticket_refund_intents IS
  'A paid ticket line whose seat was lost between payment and settlement. Recorded in the paid hook, refunded by the cron executor. claimed_at is the double-refund guard; executed_at means finished.';

COMMIT;
