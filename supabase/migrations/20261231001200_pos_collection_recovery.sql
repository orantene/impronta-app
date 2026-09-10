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
-- This migration is the other half, and it turned out to be three halves,
-- because a review against the real database found that the first two rested
-- on a schema and a trigger that do not permit the journey at all:
--
--   1. `booking_transactions.metadata` DOES NOT EXIST. Four shipped code paths
--      already write or read it and no migration in this repository ever
--      created it. It is created here.
--   2. THE TRANSITION TRIGGER REFUSES EVERY ORDER-BACKED CARD SALE, so no row
--      can ever reach `payment_requested` and the worker below would have had
--      nothing to claim, for ever. The rule is narrowed here.
--   3. the recovery bookkeeping itself, which is what the rest of this file is.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. `booking_transactions.metadata`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROVEN MISSING, NOT ASSUMED. Production (`pluhdapdnuiulvxmyspd`) has 33
-- columns on `booking_transactions` and `metadata` is not among them;
-- `information_schema.columns` was read directly. The generated types at
-- `web/src/lib/supabase/database.types.ts` agree with production exactly, so
-- they were never stale — the column simply was never created. The isolated
-- QA branch has one out of band, which is why every test and every probe run
-- against that branch passed while production could not have run any of it.
--
-- FOUR SHIPPED PATHS ALREADY DEPEND ON IT, and this is why the column is
-- created rather than designed away:
--
--   · `20261230000300_pos_shifts.sql` states the contract in its own header —
--     "Tenders stamp booking_transactions.metadata.shift_id when a shift is
--     open" — and `lib/pos/shift.ts` reads `metadata` to total a shift.
--   · `lib/orders/settle-at-door.ts` writes the whole cash tender bag into it:
--     `paid_via`, `shift_id`, `tendered_cents`, `change_cents`. Without the
--     column, POS CASH cannot record a sale at all.
--   · `lib/pos/collection.ts` writes the collection reservation id into it,
--     which is how `markPaid` closes the claim over the order's balance.
--   · `lib/bookings/transactions.ts` reads it back at exactly that moment.
--
-- WHY NOT `provider_metadata`, WHICH DOES EXIST. That bag belongs to the
-- provider: `markPaid` writes Stripe's `payment_intent_id` into it and a
-- refund reads it back. What goes in `metadata` is OURS — a shift, a drawer's
-- change, a claim over an order's balance — and none of it is a fact Stripe
-- would recognise. Folding the two together would put the reference a refund
-- depends on in the same bag as a cashier's change, where the next writer to
-- replace rather than merge the bag destroys it.
--
-- ADDITIVE AND DEFAULTED, so no reader has to learn a new nullable: an
-- existing row gets `{}`, which is what every reader of an unstamped row
-- already assumes.
--
-- AFTER THIS IS PUSHED, REGENERATE `database.types.ts`. The types are
-- generated from production and are correct for it TODAY, which is why they do
-- not list this column. They become wrong the moment this applies, and nothing
-- in the build notices: every path that reads or writes `metadata` goes
-- through a hand-typed admin client, so the generated Row type is not
-- consulted. It is a documentation drift, not a compile error, which is
-- exactly the kind that survives.

BEGIN;

ALTER TABLE public.booking_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.booking_transactions.metadata IS
  'OUR facts about this money row: the POS shift, the cash tender and change, the collection reservation over the order balance, and the provider request id a lost card collection is reconciled by. Provider-owned facts live in provider_metadata; do not merge the two.';

-- The claim below and the exceptions inbox both walk the unresolved
-- collections oldest-first every minute. Partial, because the rows that are
-- not in this status are the whole table.
CREATE INDEX IF NOT EXISTS booking_transactions_payment_requested_idx
  ON public.booking_transactions (requested_at)
  WHERE status = 'payment_requested';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The transition trigger, narrowed for an ORDER-BACKED sale
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS REPRODUCED. The shape the till actually creates — order-backed,
-- `provider = 'stripe'`, `payout_receiver_id` NULL — is refused BOTH times it
-- has to move:
--
--   draft -> payment_requested : payout_receiver_id is required before moving
--                                to status payment_requested (on-platform only)
--   payment_requested -> paid  : payout_receiver_id is required before moving
--                                to status paid (on-platform only)
--
-- So a POS card sale can never leave `draft`, `pos_claim_stale_collections`
-- would never have a row to claim, and the count of non-manual transactions
-- ever recorded in production is ZERO. The recovery worker was written over a
-- state the database does not allow to exist.
--
-- IS THE TILL WRONG, OR IS THE RULE? The rule, for an order-backed sale, and
-- three independent facts say so:
--
--   a. `payout_receiver_id` REFERENCES `payout_accounts` and is chosen by a
--      person: `setTransactionPayoutReceiver` only accepts an id returned by
--      `loadPayoutReceiverCandidatesForBooking`, which returns connected
--      payout accounts for the booking's talent or the workspace. A counter
--      sale has no such choice to offer, and the venue the POS exists for —
--      one that takes cards over a counter and has never onboarded Connect —
--      has no `payout_accounts` row to name. There is no correct value to
--      supply, so the requirement is not a bar the till can clear.
--   b. NOTHING ROUTES ON IT. `executeBookingTransfers` — the fan-out that
--      actually moves money out — never reads `payout_receiver_id`; it reads
--      the booking's commission snapshots. So requiring it before money may be
--      requested protects no payout, and a missing snapshot still raises its
--      own alarm. The column is an attribution recorded on the inquiry-era
--      work screen, not a routing key.
--   c. THE CHARGE ALWAYS LANDS ON THE PLATFORM ACCOUNT. The connected-account
--      branch was removed from `stripe-checkout.ts` by the 2026-09-01 finance
--      audit; there is no destination to be missing at the moment the money is
--      requested. What the money is owed to is decided at payout time.
--
-- The rule's own reasoning, written when it was made rail-aware
-- (20260714161746) and restored after phase 8 dropped it (20261230001500), is
-- that on-platform money "routes to a connected account and requires a
-- receiver". That reasoning is about an INQUIRY: an agency takes a client's
-- money and owes it onward to a talent, and taking it before knowing who is
-- owed is how a booking is collected and never paid out. An order is the other
-- shape: a merchant sells their own goods over their own counter, the money is
-- theirs, and the payee is `source_tenant_id` — structurally, with nothing to
-- choose and nothing to forget.
--
-- SO THE RULE IS NARROWED, NOT DROPPED. `order_id IS NULL` — an inquiry-backed
-- transaction — still requires a receiver before it may take a penny, exactly
-- as it does today. This is re-emitted as the WHOLE body rather than patched,
-- and the body below is production's current definition with that one clause
-- added, because a `CREATE OR REPLACE` of a partial body is precisely how
-- phase 8 silently deleted the rail-awareness this file depends on.

CREATE OR REPLACE FUNCTION public.validate_booking_transaction_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'refunded' THEN
      IF NEW.refund_of_transaction_id IS NULL THEN
        RAISE EXCEPTION
          'booking_transactions: refunded insert rows must reference refund_of_transaction_id';
      END IF;
      IF NEW.refunded_at IS NULL THEN
        NEW.refunded_at := now();
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'booking_transactions: initial status must be draft';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- RAIL-AWARE receiver requirement, now also SCOPE-AWARE.
  --
  -- rail  (`provider IS DISTINCT FROM 'manual'`): off-platform money — cash,
  --       wire, venue_paid — routes nothing and needs no destination. NOT `<>`:
  --       a NULL provider stays on the receiver-REQUIRED side, so an unknown
  --       rail fails closed. Inherited from 20260714161746 / 20261230001500.
  -- scope (`order_id IS NULL`): an INQUIRY's money is owed onward to a talent
  --       or an agency, and taking it before knowing who is owed is how a
  --       booking is collected and never paid out. An ORDER's money is the
  --       selling workspace's own take over its own counter; the payee is
  --       `source_tenant_id` and there is no per-transaction choice to make.
  --       See this migration's header for why nothing routes on this column.
  IF NEW.status IN ('payment_requested', 'pending', 'paid', 'payout_pending', 'payout_sent')
     AND NEW.payout_receiver_id IS NULL
     AND NEW.provider IS DISTINCT FROM 'manual'
     AND NEW.order_id IS NULL THEN
    RAISE EXCEPTION
      'booking_transactions: payout_receiver_id is required before moving to status % (on-platform only)',
      NEW.status;
  END IF;

  IF NEW.status = 'refunded' AND NEW.refund_of_transaction_id IS NULL THEN
    RAISE EXCEPTION
      'booking_transactions: refund_of_transaction_id is required before moving to refunded';
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('payment_requested', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'payment_requested' AND NEW.status IN ('pending', 'paid', 'cancelled', 'failed') THEN
    NULL;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('paid', 'failed', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'paid' AND NEW.status IN ('payout_pending', 'refunded', 'disputed') THEN
    NULL;
  ELSIF OLD.status = 'payout_pending' AND NEW.status IN ('payout_sent', 'refunded', 'failed') THEN
    NULL;
  ELSIF OLD.status = 'payout_sent' AND NEW.status IN ('refunded') THEN
    NULL;
  ELSIF OLD.status = 'failed' AND NEW.status IN ('payment_requested', 'cancelled') THEN
    NULL;
  ELSIF OLD.status = 'disputed' AND NEW.status IN ('paid', 'refunded', 'failed') THEN
    NULL;
  ELSE
    RAISE EXCEPTION
      'booking_transactions: invalid status transition from % to %',
      OLD.status, NEW.status;
  END IF;

  -- Always set the timestamp on entry into a state. For retries (e.g.
  -- failed → payment_requested → failed) we OVERWRITE so the audit trail
  -- captures the latest entry into that state — audit finding M11.
  IF NEW.status = 'payment_requested' THEN
    NEW.requested_at := now();
    NEW.failed_at := NULL;
  ELSIF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  ELSIF NEW.status = 'payout_pending' AND NEW.payout_initiated_at IS NULL THEN
    NEW.payout_initiated_at := now();
  ELSIF NEW.status = 'payout_sent' AND NEW.payout_completed_at IS NULL THEN
    NEW.payout_completed_at := now();
  ELSIF NEW.status = 'refunded' AND NEW.refunded_at IS NULL THEN
    NEW.refunded_at := now();
  ELSIF NEW.status = 'failed' THEN
    NEW.failed_at := now();
  ELSIF NEW.status = 'disputed' AND NEW.disputed_at IS NULL THEN
    NEW.disputed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_booking_transaction_status_transition() IS
  'Status graph for booking_transactions plus two guards on the receiver: rail-aware (off-platform money needs no payout destination) and scope-aware (an order-backed sale is the selling workspace''s own take, so there is no per-transaction payee to name). An inquiry-backed on-platform transaction still cannot request money without a receiver.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The recovery ledger
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY A SEPARATE TABLE AND NOT COLUMNS ON `booking_transactions`. The recovery
-- attempt count, the backoff and the visibility lease are facts about a
-- RECONCILIATION, not about the money. A transaction that is never lost never
-- gets a row here, which is almost all of them; putting five nullable columns
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

-- ── The budget, and the end of the loop ─────────────────────────────────────
--
-- WHAT WAS REPRODUCED. A row the worker could not finish wrote neither a next
-- attempt time nor a resolved time. The lease IS `next_attempt_at`, and the
-- claim's only predicates were "unresolved" and "due", so the same row came
-- back every five minutes for ever: eight passes, attempts climbing 1..8, and
-- the ninth claim still returned it. A payment nobody can settle was being
-- asked about until somebody noticed, which is the definition of nobody
-- noticing.
--
-- `max_attempts` IS ON THE ROW rather than a constant in the worker for one
-- reason: a person has to be able to grant more. The exceptions inbox's
-- "ask again" raises this ceiling, which is what makes an escalated row
-- actionable instead of merely parked. A constant in TypeScript could not be
-- raised for one payment without being raised for every payment.
ALTER TABLE public.pos_collection_recoveries
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8;

ALTER TABLE public.pos_collection_recoveries
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

ALTER TABLE public.pos_collection_recoveries
  ADD COLUMN IF NOT EXISTS escalation_reason text;

DO $$
BEGIN
  ALTER TABLE public.pos_collection_recoveries
    ADD CONSTRAINT pos_collection_recoveries_budget_positive CHECK (max_attempts > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.pos_collection_recoveries IS
  'P3: per-transaction bookkeeping for reconciling a POS card collection whose response was lost. Rows are created by pos_claim_stale_collections, which never creates a payment request. A row that spends its max_attempts is stamped escalated_at and stops being claimed until a person grants more.';

COMMENT ON COLUMN public.pos_collection_recoveries.escalated_at IS
  'The machine has stopped asking about this payment. Terminal until a person grants more budget from the exceptions inbox. The transaction stays in payment_requested, so the row stays in that inbox and is never silently dropped.';

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
--
-- A ROW THAT HAS SPENT ITS BUDGET IS NOT RETURNED EITHER, and it is stamped
-- `escalated_at` in the same statement that would otherwise have handed it out
-- again. Doing that HERE and not in the worker is deliberate: the loop being
-- closed is the one where the worker never finishes, so a cap the worker has
-- to write would be a cap that is never written.
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
  WITH
  -- THE END OF THE LOOP. A due row that has spent its budget is stamped
  -- terminal instead of being handed out. It is not deleted and its
  -- transaction is not touched: the transaction stays in `payment_requested`,
  -- so the row stays in the exceptions inbox in front of a person, wearing the
  -- provider's last answer and the number of times it was asked.
  --
  -- BOUNDED AND SKIP-LOCKED LIKE THE CLAIM ITSELF, and for a sharper reason
  -- than symmetry: a bare UPDATE here would WAIT on a row another pass holds,
  -- and one statement that waits on a row while holding rows another statement
  -- is waiting on is how two crons deadlock. Nothing in this function may ever
  -- block on another copy of this function.
  over_budget AS (
    SELECT r.transaction_id AS id
    FROM public.pos_collection_recoveries r
    WHERE r.resolved_at IS NULL
      AND r.escalated_at IS NULL
      AND r.next_attempt_at <= now()
      AND r.attempts >= r.max_attempts
    ORDER BY r.next_attempt_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  exhausted AS (
    UPDATE public.pos_collection_recoveries r
    SET escalated_at = now(),
        escalation_reason = COALESCE(r.escalation_reason, 'attempts_exhausted'),
        claimed_at = NULL,
        updated_at = now()
    FROM over_budget
    WHERE r.transaction_id = over_budget.id
    RETURNING r.transaction_id AS id
  ),
  picked AS (
    SELECT r.transaction_id AS id
    FROM public.pos_collection_recoveries r
    JOIN public.booking_transactions t ON t.id = r.transaction_id
    WHERE r.resolved_at IS NULL
      AND r.escalated_at IS NULL
      AND r.attempts < r.max_attempts
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
  'P3: lease a bounded batch of POS card collections stuck in payment_requested so one worker can ask the provider what happened. FOR UPDATE SKIP LOCKED, because acting twice on a succeeded answer would complete one order twice. A row that has spent max_attempts is stamped escalated_at instead of being handed out again. Returns nothing that could open a payment.';

COMMIT;
