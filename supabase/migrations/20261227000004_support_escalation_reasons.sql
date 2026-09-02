-- Escalation reasons could not express WHY a case reached a human.
--
-- The existing values describe only how the AI gave up: user_requested,
-- ai_low_confidence, ai_sentiment, ai_suggested, ai_unavailable, plus
-- staff_initiated. None of them says "this is about money", "this is a
-- chargeback", or "this is a safety report" — the five categories the support
-- runbook routes on and where the response deadline is external rather than
-- internal.
--
-- The practical effect was that a refund dispute and a low-confidence answer
-- landed in the queue indistinguishable from each other, and no report could
-- ever count how many money cases support handled.
--
-- TEXT + CHECK, not an enum, so this is a plain constraint swap with none of
-- the ALTER TYPE ... ADD VALUE transaction hazard. Additive: every existing
-- value is preserved, so no row can be invalidated by this migration.

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_escalation_reason_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_escalation_reason_check
  CHECK (escalation_reason IN (
    -- How the AI handed off (unchanged)
    'user_requested','ai_low_confidence','ai_sentiment','ai_suggested','ai_unavailable',
    'staff_initiated',
    -- What the case is ABOUT. These carry an owning department in the runbook
    -- and, for dispute and legal, an externally imposed deadline.
    'billing','refund','dispute','safety','legal'
  ));

COMMENT ON COLUMN public.support_tickets.escalation_reason IS
  'Why the ticket reached a human. The ai_* and user_requested values describe '
  'the handoff mechanism; billing/refund/dispute/safety/legal describe the '
  'subject matter and map to an owning department in the escalation runbook.';
