-- L1 — Stripe webhook event-level idempotency.
--
-- Stripe webhook deliveries can repeat (network retry, internal retry, manual
-- replay). Each handler should be idempotent on its own table state, but
-- a defensive event-level shortcut prevents duplicate work and double-charges.
--
-- The webhook handler INSERTs into this table on entry; ON CONFLICT short-
-- circuits and returns 200 immediately.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id      TEXT        PRIMARY KEY,
  event_type    TEXT        NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Optional metadata for forensics; not relied on by the handler.
  livemode      BOOLEAN,
  api_version   TEXT
);

COMMENT ON TABLE public.stripe_processed_events IS
  'Idempotency log keyed by Stripe event.id. Webhook handler INSERTs on entry; ON CONFLICT returns 200 immediately. Prevents duplicate handling on Stripe retries.';

-- Service role only: webhook handler writes via service role; nothing else
-- should ever read or write this table from request-context. RLS enabled with
-- no policies = locked down.
ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;

-- Index for periodic pruning (delete events older than N days).
CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_processed_at
  ON public.stripe_processed_events (processed_at DESC);

COMMIT;
