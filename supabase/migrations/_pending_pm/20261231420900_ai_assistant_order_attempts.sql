-- TUL-36 slice 5 [MONEY]: one-row-per-attempt claim table for the booking assistant's
-- "create order + send pay link" executor, so a retry or a double tap can never create a
-- second order or a second link.
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies it after merge.
-- The executor is OFF by default (env flag) and FAILS CLOSED when this table is missing
-- (a failed claim read or write is a handoff to a person, never a purchase).
--
-- Additive and idempotent only. RLS is ON with NO policies: only the service role (the
-- server executor) can read or write; anon and authenticated get nothing.
--
-- Rollback (only if no row matters; the table holds no money, only attempt bookkeeping):
--   DROP TABLE IF EXISTS public.ai_assistant_order_attempts;

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_assistant_order_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- Server-built key: ai-order:<inquiry>:<offering>:<start>:<units>. Never model text.
  attempt_key text NOT NULL,
  order_id uuid,
  payment_link_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_assistant_order_attempts_key_len CHECK (char_length(attempt_key) BETWEEN 8 AND 300)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_assistant_order_attempts_tenant_key
  ON public.ai_assistant_order_attempts (tenant_id, attempt_key);

ALTER TABLE public.ai_assistant_order_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_assistant_order_attempts FROM anon, authenticated;

COMMIT;
