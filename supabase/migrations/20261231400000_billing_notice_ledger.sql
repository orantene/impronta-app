-- TUL-832: idempotency ledger for subscription notice emails that are not tied
-- to a Stripe invoice (cancel / resume confirmation). billing_dunning_notices is
-- keyed on invoice id, so it cannot hold these. dedupe_key =
-- cancel_state:<subscription>:<cancel_at_period_end 0|1>:<period end>.
CREATE TABLE IF NOT EXISTS public.billing_notice_ledger (
  dedupe_key TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  scope      TEXT NOT NULL CHECK (scope IN ('talent', 'workspace')),
  stripe_subscription_id TEXT,
  sent_to    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_notice_ledger ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.billing_notice_ledger IS
  'Idempotency ledger for subscription notice emails (TUL-832). Service role only; no policies.';
