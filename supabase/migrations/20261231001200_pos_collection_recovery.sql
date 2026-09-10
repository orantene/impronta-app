-- P3: a card payment whose outcome is unknown must be resolved without ever
-- charging twice.
--
-- THE DEFECT. `lib/pos/collection.ts` opened a Stripe Checkout session, read
-- the session id into a local, and discarded it. The transaction row therefore
-- recorded that money HAD BEEN ASKED FOR and nothing recorded WHAT was asked.
-- When the response was lost — a killed request, a dropped socket, a till that
-- crashed between the create and the commit — the money may or may not have
-- moved, and no code in the system could find out. The exceptions inbox's only
-- honest move was to advise a human to walk to the terminal and look.
--
-- The application half of the fix stamps the provider's request id onto the
-- transaction's `metadata`, beside the collection reservation it belongs to.
-- This migration is the other half: the bookkeeping a worker needs to ask the
-- provider about those transactions, on a schedule, without ever asking twice
-- at once and without ever opening a second payment.
--
-- WHY A SEPARATE TABLE AND NOT COLUMNS ON `booking_transactions`. The recovery
-- attempt count, the backoff and the visibility lease are facts about a
-- RECONCILIATION, not about the money. A transaction that is never lost never
-- gets a row here, which is almost all of them; putting four nullable columns
-- on the money table to describe an exception would make every reader of that
-- table carry them. It also keeps the claim's `FOR UPDATE SKIP LOCKED` off the
-- hot money row: the worker locks its own bookkeeping, never the transaction
-- the till may be settling in the same instant.
--
-- WHY `FOR UPDATE SKIP LOCKED` AT ALL. The same reasoning as
-- `claim_outbox_messages` (20261230001300), and here it is not an efficiency
-- argument. Two overlapping cron runs that both read the same unresolved
-- transaction would both ask the provider and both act on the answer, and the
-- action on `succeeded` is `markPaid` — which completes the order, fans out
-- payouts and closes the reservation. Doing that twice is exactly the class of
-- damage this whole mechanism exists to prevent, so the claim is a lock, not a
-- flag.
--
-- NOTHING HERE CAN CHARGE ANYBODY. The claim returns what to ask about. It has
-- no path to create a payment request, and the worker that reads it is written
-- with no provider create in scope at all.
--
-- PROVED AGAINST A REAL DATABASE, not against a fake. The isolated journeys
-- branch (fxlankepwnvelxjrahwk) was given two POS-shaped transactions stuck in
-- `payment_requested` — one carrying a provider request id, one not — and the
-- following six properties were asserted in a rolled-back DO block. A fake
-- store has no partial index, no status-transition trigger and no row lock, so
-- none of these could have been demonstrated in TypeScript:
--
--   0. a collection still INSIDE the staleness window is not touched
--   1. a stale one IS claimed, and the claim returns its provider request id
--   2. one with no provider request id is never enrolled: nothing can be asked
--   3. the lease holds — a second pass does not hand out the same row
--   4. once due it comes back, and the attempt counts again
--   5. a resolved recovery is never claimed a second time
--   6. a transaction that has since reached a real status is not reconciled
--
-- One thing that probe taught, which the design depends on:
-- `booking_transactions.requested_at` is STAMPED BY THE TRANSITION into
-- `payment_requested`, not carried from the insert. That is why the staleness
-- window is measured against it — it is the moment the reader was actually
-- asked, which is the only instant that means anything here.

BEGIN;

-- ── The recovery ledger ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pos_collection_recoveries (
  -- One row per transaction, and the PRIMARY KEY is what makes it so: a second
  -- claim on the same transaction updates this row rather than queueing a
  -- second reconciliation of one payment.
  transaction_id  uuid PRIMARY KEY REFERENCES public.booking_transactions(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- Incremented ON CLAIM, not on outcome. A worker that dies between asking
  -- the provider and writing the answer has still spent an attempt, and a
  -- counter that only counted clean outcomes would loop such a row forever
  -- while reporting that it had never been tried.
  attempts        integer NOT NULL DEFAULT 0,
  -- The provider's last answer, in the engine's own vocabulary. NULL before
  -- the first answer; 'unknown' is a real answer and is stored as one.
  last_state      text,
  last_error      text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  -- Set when the reconciliation reached a terminal answer and acted on it.
  -- A resolved row is never claimed again.
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pos_collection_recoveries IS
  'P3: per-transaction bookkeeping for reconciling a POS card collection whose response was lost. Rows are created by pos_claim_stale_collections, which never creates a payment request.';

CREATE INDEX IF NOT EXISTS pos_collection_recoveries_due_idx
  ON public.pos_collection_recoveries (next_attempt_at)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS pos_collection_recoveries_tenant_idx
  ON public.pos_collection_recoveries (tenant_id, created_at DESC);

ALTER TABLE public.pos_collection_recoveries ENABLE ROW LEVEL SECURITY;

-- Staff may LOOK at what is being reconciled for their own workspace: the
-- exceptions inbox shows the attempt count, and a number nobody can read is a
-- number nobody trusts. Every write goes through the SECURITY DEFINER function
-- below or the service role worker.
DROP POLICY IF EXISTS pos_collection_recoveries_staff_select ON public.pos_collection_recoveries;
CREATE POLICY pos_collection_recoveries_staff_select ON public.pos_collection_recoveries
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON public.pos_collection_recoveries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_collection_recoveries TO authenticated;
GRANT ALL ON public.pos_collection_recoveries TO service_role;

-- ── The claim ───────────────────────────────────────────────────────────────
--
-- Takes a bounded batch of POS card collections that have been sitting in
-- `payment_requested` longer than the caller's staleness window, leases them,
-- and returns everything the worker needs to ask the provider: the provider's
-- request id and the reservation whose balance is still claimed.
--
-- A TRANSACTION WITH NO PROVIDER REQUEST ID IS NOT RETURNED, and that is the
-- honest boundary of this mechanism rather than an oversight. Such a row was
-- either opened before the stamp existed or opened in mock mode, and there is
-- nothing to ask about; it stays in the exceptions inbox as a row a person has
-- to resolve, which is where it was before and where it belongs.
CREATE OR REPLACE FUNCTION public.pos_claim_stale_collections(
  p_limit integer DEFAULT 25,
  p_stale_seconds integer DEFAULT 1200,
  p_visibility_seconds integer DEFAULT 300
)
RETURNS TABLE (
  transaction_id uuid,
  tenant_id uuid,
  order_id uuid,
  payment_request_id text,
  reservation_id uuid,
  gross_amount_cents bigint,
  currency text,
  requested_at timestamptz,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
-- EVERY OUTPUT COLUMN NAME IS ALSO A PLPGSQL VARIABLE, and this is the line
-- that stops that from being a runtime error. `RETURNS TABLE (transaction_id
-- ..., attempts ...)` declares variables of those names, so a bare
-- `transaction_id` anywhere in the body — including inside an `ON CONFLICT`
-- target — is ambiguous and raises 42702 the FIRST TIME THE FUNCTION IS
-- CALLED. It creates perfectly cleanly, which is exactly why this was found by
-- calling it against a real database rather than by reading it.
#variable_conflict use_column
DECLARE
  v_limit integer := GREATEST(1, LEAST(200, COALESCE(p_limit, 25)));
  v_stale integer := GREATEST(60, COALESCE(p_stale_seconds, 1200));
  v_visibility integer := GREATEST(60, COALESCE(p_visibility_seconds, 300));
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT r.transaction_id AS id
    FROM public.pos_collection_recoveries r
    JOIN public.booking_transactions t ON t.id = r.transaction_id
    WHERE r.resolved_at IS NULL
      AND r.next_attempt_at <= now()
      AND t.status = 'payment_requested'
    ORDER BY r.next_attempt_at ASC
    LIMIT v_limit
    FOR UPDATE OF r SKIP LOCKED
  ),
  -- Transactions that have never been reconciled have no row yet. Enrolling
  -- them here rather than in a separate pass means one statement decides both
  -- "is it stale" and "is somebody already on it".
  -- ENROLLED AT attempts = 1, NOT 0, and the reason is a Postgres rule rather
  -- than a preference: every data-modifying CTE in one statement sees the same
  -- snapshot, so a later UPDATE cannot find the rows this INSERT just wrote.
  -- Enrolling and claiming are therefore one act, and the first attempt is
  -- counted where it happens.
  fresh AS (
    INSERT INTO public.pos_collection_recoveries (transaction_id, tenant_id, attempts, claimed_at, next_attempt_at)
    SELECT t.id, t.source_tenant_id, 1, now(), now() + make_interval(secs => v_visibility)
    FROM public.booking_transactions t
    WHERE t.status = 'payment_requested'
      AND COALESCE(t.requested_at, t.created_at) <= now() - make_interval(secs => v_stale)
      AND t.metadata ? 'collection_payment_request_id'
      AND NOT EXISTS (
        SELECT 1 FROM public.pos_collection_recoveries e WHERE e.transaction_id = t.id
      )
    ORDER BY COALESCE(t.requested_at, t.created_at) ASC
    LIMIT v_limit
    ON CONFLICT (transaction_id) DO NOTHING
    -- QUALIFIED, and it has to be. `RETURNS TABLE` makes every output column
    -- name a plpgsql variable, so a bare `transaction_id` here is ambiguous
    -- between the variable and the column and Postgres raises 42702 at
    -- execution — a function that creates cleanly and fails the first time it
    -- is called.
    RETURNING pos_collection_recoveries.transaction_id AS id,
              pos_collection_recoveries.attempts AS attempts
  ),
  claimed AS (
    UPDATE public.pos_collection_recoveries r
    SET claimed_at = now(),
        next_attempt_at = now() + make_interval(secs => v_visibility),
        attempts = r.attempts + 1,
        updated_at = now()
    FROM picked
    WHERE r.transaction_id = picked.id
    RETURNING r.transaction_id AS id, r.attempts AS attempts
  ),
  all_claimed AS (
    SELECT id, attempts FROM claimed
    UNION ALL
    SELECT id, attempts FROM fresh
  )
  SELECT
    t.id,
    t.source_tenant_id,
    t.order_id,
    (t.metadata ->> 'collection_payment_request_id')::text,
    NULLIF(t.metadata ->> 'collection_reservation_id', '')::uuid,
    t.gross_amount_cents,
    t.currency,
    COALESCE(t.requested_at, t.created_at),
    a.attempts
  FROM all_claimed a
  JOIN public.booking_transactions t ON t.id = a.id
  WHERE t.metadata ? 'collection_payment_request_id';
END;
$$;

REVOKE ALL ON FUNCTION public.pos_claim_stale_collections(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_claim_stale_collections(integer, integer, integer) TO service_role;

COMMENT ON FUNCTION public.pos_claim_stale_collections(integer, integer, integer) IS
  'P3: lease a bounded batch of POS card collections stuck in payment_requested so one worker can ask the provider what happened. FOR UPDATE SKIP LOCKED, because acting twice on a succeeded answer would complete one order twice. Returns nothing that could open a payment.';

COMMIT;
