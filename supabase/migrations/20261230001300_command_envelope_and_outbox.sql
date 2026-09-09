-- The command envelope's two tables: `command_idempotency` and `outbox_messages`.
--
-- WHY ONE MIGRATION FOR TWO TABLES. They are one mechanism. A command that
-- succeeds and then fails to schedule its side effect is not idempotent in any
-- useful sense — the caller's retry sees "already done" and the effect never
-- happens. The outbox row is written by the SAME statement batch that records
-- the command result, which is only meaningful if both tables exist together.
--
--
-- 1. command_idempotency
-- ══════════════════════
-- Today every adapter does this for itself, differently: Stripe has
-- `stripe_processed_events`, the purchase pipeline has an `orderKey`, the
-- capacity engine leans on unique constraints, the ticket refund cron does
-- claim-before-execute on `claimed_at`. Each is correct in isolation and none
-- of them compose — an operator double-tapping a button in the POS gets
-- whichever guard the code path underneath happens to have, and nothing
-- anywhere can answer "was this exact request already processed?".
--
-- THE ROW IS A CLAIM, NOT A LOG. It is inserted BEFORE the handler runs, with
-- `status = 'in_flight'`, so a second concurrent copy of the same request loses
-- the insert and can be told "your first one is still running" instead of
-- running a duplicate. That is the double-click case, and it is the one a
-- results-only table cannot cover: by the time a result exists the damage is
-- done.
--
-- THE FINGERPRINT IS NOT DECORATION. A client that reuses an idempotency key
-- with different arguments is a bug — usually a key generated per component
-- mount rather than per intent — and the wrong answer is to silently return
-- the first request's result for the second request's arguments. Storing a
-- hash of the arguments lets the runner refuse instead. Without it,
-- idempotency turns a client bug into a silent data-loss bug.
--
--
-- 2. outbox_messages
-- ══════════════════
-- `failed_engine_effects` is the only durable retry queue in the system, and it
-- is EXTENDED here, not replaced: it stays exactly as it is, owning inquiry
-- engine listener failures, which is what its NOT NULL `inquiry_id` says it is
-- for. What it cannot be is the general queue — a refund notification, a
-- webhook fan-out or a printer dispatch has no inquiry to hang off, and giving
-- every side effect a fake inquiry id to reach the retry machinery is how a
-- table stops meaning anything.
--
-- More importantly, `failed_engine_effects` only records what ALREADY FAILED.
-- An effect lost to a crash between "the order is paid" and "the listener was
-- invoked" leaves no row at all — there is nothing to retry because nothing
-- ever observed the failure. The outbox inverts that: the message is written
-- with the transaction that caused it, so the effect is durable BEFORE anyone
-- tries to perform it.
--
-- DELIVERY IS AT-LEAST-ONCE, and that is a promise to consumers, not an
-- apology. Exactly-once across a process boundary does not exist; what exists
-- is a durable message plus an idempotent consumer, which is why every handler
-- registered against this table has to be safe to run twice.

BEGIN;

-- ── command_idempotency ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.command_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- The command's name, e.g. 'pos.startCollection'. Part of the uniqueness so
  -- a key that leaked between two different commands cannot make one of them
  -- return the other's result.
  command text NOT NULL,
  idempotency_key text NOT NULL,
  -- SHA-256 of the canonicalised arguments. See the note above: this is what
  -- turns a key-reuse bug into a refusal instead of a wrong answer.
  request_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'in_flight'
    CHECK (status IN ('in_flight', 'succeeded', 'failed')),
  -- The handler's return value, replayed verbatim to a duplicate request.
  -- NULL while in flight and on failure.
  result jsonb,
  -- Why it failed, for the Exceptions inbox. Never shown to a public caller.
  error_message text,
  actor_user_id uuid,
  correlation_id text,
  attempt_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- THE constraint. Everything else here is bookkeeping; this is the mechanism.
CREATE UNIQUE INDEX IF NOT EXISTS command_idempotency_key_unique
  ON public.command_idempotency (tenant_id, command, idempotency_key);

-- Sweeping stale in-flight claims (a crashed handler leaves one behind) and
-- ageing out old rows both scan on time, per status.
CREATE INDEX IF NOT EXISTS command_idempotency_status_created_idx
  ON public.command_idempotency (status, created_at);

CREATE INDEX IF NOT EXISTS command_idempotency_correlation_idx
  ON public.command_idempotency (correlation_id)
  WHERE correlation_id IS NOT NULL;

ALTER TABLE public.command_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.command_idempotency FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.command_idempotency TO service_role;

COMMENT ON TABLE public.command_idempotency IS
  'One row per (tenant, command, idempotency key). Inserted BEFORE the handler runs so a concurrent duplicate loses the insert rather than running twice. request_fingerprint refuses a key reused with different arguments.';

-- ── outbox_messages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  topic text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Optional caller-chosen key. Where present it makes enqueueing itself
  -- idempotent, which matters because the thing enqueueing is frequently a
  -- retried command: without it, three retries of one paid order produce three
  -- receipt emails.
  dedupe_key text,
  correlation_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'dead')),
  attempt_count integer NOT NULL DEFAULT 0,
  -- Backoff anchor, same shape as failed_engine_effects.next_retry_at so the
  -- two queues read the same way to an operator looking at both.
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  -- Set when the worker takes the row. A claimed row with no terminal status
  -- and an old claim is the thing a stale-claim sweep looks for.
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

-- 'dead' rows keep their dedupe key so a re-enqueue after a permanent failure
-- is a deliberate act (clear the row, or use a new key) rather than an accident
-- that silently re-runs an effect a human already gave up on.
CREATE UNIQUE INDEX IF NOT EXISTS outbox_messages_dedupe_unique
  ON public.outbox_messages (tenant_id, topic, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS outbox_messages_ready_idx
  ON public.outbox_messages (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS outbox_messages_tenant_status_idx
  ON public.outbox_messages (tenant_id, status);

ALTER TABLE public.outbox_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbox_messages FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.outbox_messages TO service_role;

COMMENT ON TABLE public.outbox_messages IS
  'Transactional outbox. Extends failed_engine_effects rather than replacing it: that table owns inquiry-engine listener failures and requires an inquiry_id. Delivery is at-least-once, so every registered handler must be safe to run twice.';

-- ── claim_outbox_messages ──────────────────────────────────────────────────
--
-- FOR UPDATE SKIP LOCKED, which is the whole reason this is a function and not
-- a SELECT followed by an UPDATE from the application.
--
-- The read-then-write shape has a window between the two statements, and two
-- overlapping cron runs both read the same row and both deliver it. The
-- ticket-refund cron works around that with a conditional UPDATE on
-- `claimed_at IS NULL` and accepts the loser doing wasted work; at outbox
-- volumes that becomes every worker fighting over the head of one queue.
-- SKIP LOCKED lets the second worker take the NEXT row instead of losing a
-- race for the first.
--
-- The claim also increments `attempt_count` and pushes `next_attempt_at`
-- forward, so a worker that dies mid-delivery does not hand the same message
-- to the next run immediately — it comes back after the backoff, which is the
-- only honest thing to do when we cannot tell a crash from a slow handler.
CREATE OR REPLACE FUNCTION public.claim_outbox_messages(
  p_limit integer DEFAULT 25,
  p_topics text[] DEFAULT NULL,
  p_visibility_seconds integer DEFAULT 120
)
RETURNS SETOF public.outbox_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT m.id
    FROM public.outbox_messages m
    WHERE m.status = 'pending'
      AND m.next_attempt_at <= now()
      AND (p_topics IS NULL OR m.topic = ANY (p_topics))
    ORDER BY m.next_attempt_at ASC, m.created_at ASC
    LIMIT GREATEST(1, LEAST(200, COALESCE(p_limit, 25)))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_messages m
  SET claimed_at = now(),
      attempt_count = m.attempt_count + 1,
      next_attempt_at = now() + make_interval(secs => GREATEST(30, COALESCE(p_visibility_seconds, 120)))
  FROM picked
  WHERE m.id = picked.id
  RETURNING m.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_outbox_messages(integer, text[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox_messages(integer, text[], integer) TO service_role;

COMMENT ON FUNCTION public.claim_outbox_messages(integer, text[], integer) IS
  'Claim a batch of due outbox messages under FOR UPDATE SKIP LOCKED, incrementing attempt_count and pushing next_attempt_at forward so a worker that dies mid-delivery does not immediately re-serve the same message.';

COMMIT;
