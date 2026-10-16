-- TUL-835: failed-payment dunning.
-- past_due_since = when the subscription first went past_due (grace clock start).
-- Written by the single subscription writers; cleared when status leaves past_due.
ALTER TABLE public.talent_subscriptions    ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;
ALTER TABLE public.workspace_subscriptions ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;

-- One row per Stripe invoice we already told the customer about, so webhook
-- replays and Smart Retry attempts never resend the "payment failed" email.
CREATE TABLE IF NOT EXISTS public.billing_dunning_notices (
  stripe_invoice_id TEXT PRIMARY KEY,
  scope             TEXT NOT NULL CHECK (scope IN ('talent', 'workspace')),
  stripe_subscription_id TEXT,
  sent_to           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_dunning_notices ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.billing_dunning_notices IS
  'Idempotency ledger for the first-failure payment email (TUL-835). Service role only; no policies.';
