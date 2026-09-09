-- One order, one booking shell — enforced, not assumed.
--
-- THE DEFECT THIS CLOSES. `booking_transactions.booking_id` is NOT NULL, so
-- every payment needs a booking behind it. `createPurchase` handles that by
-- creating exactly ONE `agency_bookings` row per order and stamping `order_id`
-- on it before the insert lands, and its header says so at length. The POS card
-- path did the same insert without the "exactly one" part: `startCollection`
-- created a fresh booking every time it was called for the same order.
--
-- It is called more than once as a matter of routine. A split payment is two
-- calls. An operator who taps Card, sees the customer change their mind, and
-- taps Card again is two calls. A tab collected in three goes is three. Each
-- one minted another `agency_bookings` row pointing at the same order, and
-- every surface that counts bookings — the bookings list, agency financials,
-- commission attribution, the revenue rollups — counted one sale as two or
-- three. That is scenario P25's second sale, arriving from the till instead of
-- from the customer.
--
--
-- WHY A UNIQUE INDEX AND NOT JUST THE APPLICATION FIX
-- ══════════════════════════════════════════════════
-- The application fix (look for the order's booking, reuse it, insert only when
-- there is none) is the real repair and lands with this migration. It is also a
-- read-then-write, which two devices collecting the same tab at the same moment
-- can interleave: both read nothing, both insert. A duplicate created that way
-- is invisible — no error, no log, just a second row — and the surfaces that
-- overcount are exactly the ones nobody reconciles daily.
--
-- The index turns that race into a caught unique violation the caller can
-- resolve by re-reading, which is the shape the rest of this codebase already
-- uses for concurrent create-or-attach.
--
-- PARTIAL, on `order_id IS NOT NULL`. Most bookings in this schema have no
-- order at all — they come from the inquiry pipeline — and a plain unique index
-- would collapse every one of them onto a single NULL. `agency_bookings_order_idx`
-- from 20261228000142 is the same predicate without the uniqueness; this
-- supersedes it, so it is dropped rather than left as a redundant second index
-- on the same expression.
--
--
-- THE REMEDIATION IS DELIBERATELY NARROW
-- ══════════════════════════════════════
-- Existing duplicates have to go before the index can exist. The keeper is the
-- OLDEST booking for each order, because that is the one the order's first
-- payment attached to and the one any downstream row is most likely to
-- reference.
--
-- Transactions on the losers are re-pointed at the keeper. That is safe and not
-- a judgement call: `booking_transactions.order_id` already names the order
-- independently, so both bookings were shells for the same commercial record
-- and moving the payment does not move any money.
--
-- Losers are then deleted ONLY if nothing else references them. If something
-- does — a payout leg, a deliverable, a review — this migration REFUSES rather
-- than guessing. Merging two bookings that each carry their own downstream
-- history is a decision with money in it, and a migration that silently picks
-- one is worse than a migration that stops and names the rows.

BEGIN;

-- ─── 1. Re-point payments onto the keeper ───────────────────────────────────

WITH ranked AS (
  SELECT id,
         order_id,
         row_number() OVER (PARTITION BY order_id ORDER BY created_at, id) AS rn,
         first_value(id) OVER (PARTITION BY order_id ORDER BY created_at, id) AS keeper_id
    FROM public.agency_bookings
   WHERE order_id IS NOT NULL
)
UPDATE public.booking_transactions bt
   SET booking_id = r.keeper_id
  FROM ranked r
 WHERE bt.booking_id = r.id
   AND r.rn > 1;

-- ─── 2. Delete the now-childless losers ─────────────────────────────────────

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY order_id ORDER BY created_at, id) AS rn
    FROM public.agency_bookings
   WHERE order_id IS NOT NULL
)
DELETE FROM public.agency_bookings ab
 USING ranked r
 WHERE ab.id = r.id
   AND r.rn > 1
   AND NOT EXISTS (SELECT 1 FROM public.booking_transactions t WHERE t.booking_id = ab.id);

-- ─── 3. Refuse to guess about anything left ─────────────────────────────────

DO $guard$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
    FROM (
      SELECT order_id
        FROM public.agency_bookings
       WHERE order_id IS NOT NULL
       GROUP BY order_id
      HAVING count(*) > 1
    ) dup;

  IF v_left > 0 THEN
    RAISE EXCEPTION
      'one_booking_shell_per_order: % order(s) still have more than one agency_bookings row after '
      'transactions were merged onto the oldest. Those extra bookings carry their own downstream '
      'rows (payouts, deliverables, reviews), so merging them is a money decision, not a migration. '
      'Resolve them by hand, then re-run.', v_left;
  END IF;
END
$guard$;

-- ─── 4. The invariant ───────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.agency_bookings_order_idx;

CREATE UNIQUE INDEX IF NOT EXISTS agency_bookings_order_uniq
  ON public.agency_bookings (order_id)
  WHERE order_id IS NOT NULL;

COMMENT ON INDEX public.agency_bookings_order_uniq IS
  'One order, one booking shell. The booking exists only because booking_transactions.booking_id is '
  'NOT NULL; a second one for the same order is not a second sale, it is the same sale counted twice '
  'by every surface that lists or sums bookings.';

COMMIT;
