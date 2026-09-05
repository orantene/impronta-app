-- Phase 2 · E5b — minting is idempotent, and the shortfall is findable.
--
-- Orders & Checkout ruled how the mint hook runs, and corrected my premise
-- while doing it: `completeOrderForTransaction` is NOT a transaction. It is a
-- sequence of separate PostgREST calls -- read transactions, sum paid, read
-- allocations, commitCapacity, guarded UPDATE -- with nothing wrapping them.
-- Verified before building on it: no `.rpc(`, no BEGIN, six independent
-- `.from()` calls. The word "transaction" throughout that file means a PAYMENT,
-- which is exactly what misled me into asking for atomicity that cannot exist.
--
-- So minting runs AFTER the flip, best-effort, never blocking it: money has
-- landed, and an order stuck in `pending_payment` because a downstream write
-- failed is a worse bug than a missing ticket -- capacity lapses, the seat
-- returns, and the customer has paid. This file is the other half of that
-- ruling, which is what makes best-effort defensible rather than merely
-- convenient.
--
-- ── 1. IDEMPOTENCE, AND THE NAIVE VERSION OF IT IS A BUG ────────────────────
--
-- The ruling says "idempotent on `order_line_id`, enforced by a unique
-- constraint, not a check-then-insert". A unique index on `order_line_id`
-- ALONE would do that -- and would cap a line at ONE admission, so four GA
-- tickets on one line become one ticket and three buyers are refused at the
-- door. That is the units-versus-people confusion again, arriving in the
-- constraint this time.
--
-- The retry-safe key is (order_line_id, line_seq): the ordinal of the admission
-- WITHIN its line. Re-running the mint for a line re-inserts seq 0..n-1 and
-- conflicts, so a retry is a no-op rather than a double-mint. Partial, because
-- a cash door sale has no order line and several such admissions must coexist.

BEGIN;

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS line_seq int CHECK (line_seq IS NULL OR line_seq >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS admissions_line_seq_uniq
  ON public.admissions (order_line_id, line_seq)
  WHERE order_line_id IS NOT NULL AND line_seq IS NOT NULL;

COMMENT ON COLUMN public.admissions.line_seq IS
  'Ordinal of this admission within its order line, 0-based. Exists ONLY to make minting idempotent: '
  '(order_line_id, line_seq) is unique, so re-running the mint for a line conflicts instead of '
  'double-minting. NOT a display order and not a seat number. NULL for admissions with no order line '
  '(a cash door sale), which is why the index is partial.';

-- ── 2. THE BINDING COLUMN DID NOT EXIST, AND I AM THE ONE WHO SAID IT DID ───
--
-- `order_lines.session_id` is the agreed binding -- one checkout for two classes
-- is one order and two lines, so the session cannot live on the order. The board
-- records it. Orders & Checkout confirmed it "unchanged". I told both of them it
-- already existed, citing `20261228000142:73`.
--
-- It does not. Line 73 is inside the `orders` CREATE TABLE, which starts at :40;
-- `order_lines` starts at :105. So what exists is `orders.session_id` -- the
-- column the board says must be commented as NOT the binding -- and the binding
-- itself was never created. Found when this migration failed to compile against
-- production, which is the only reason anybody looked.
--
-- I read a line number without checking which CREATE TABLE it fell inside, and
-- my report of it was then confirmed by the table's own owner, because they were
-- confirming INTENT and I had asked about EXISTENCE. Two people agreeing about a
-- column neither had queried is the same shape as every other stale claim
-- tonight, minus the staleness: it was never true.
--
-- Added here rather than routed, by the precedent already set for
-- `sessions.event_id`: the manager who needs the column writes it into the other
-- manager's table, with their agreement. Nullable, FK to sessions, ON DELETE SET
-- NULL so losing a session never destroys the record of a sale.

ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS order_lines_session_idx
  ON public.order_lines (session_id) WHERE session_id IS NOT NULL;

COMMENT ON COLUMN public.order_lines.session_id IS
  'THE BINDING between a purchase and an occurrence. One checkout for two classes is one order and '
  'two lines, so this cannot live on the order. `orders.session_id` exists and is NOT the binding.';

COMMENT ON COLUMN public.orders.session_id IS
  'NOT THE BINDING. A box-office convenience only. The binding is order_lines.session_id, because one '
  'order can hold lines for two different sessions and this column can only name one of them.';

-- ── 3. THE SHORTFALL, AS A ROW A CRON CAN FIND ──────────────────────────────
--
-- Best-effort minting is only defensible if a failure is DETECTABLE. A log line
-- is not detection when the consequence surfaces days later at a venue door.
--
-- THE PREDICATE IS ROWS = `units`, NOT `units * admits_per_unit`. The ruling
-- said the latter and it is the people count, not the row count: one VIP table
-- for six is ONE admission of party_size 6, so comparing against 6 reports a
-- false shortfall on every table sale ever made, and a reconciler that cries
-- wolf on correct data is worse than none. Rows per line = units; people =
-- units * admits_per_unit. Fourth appearance of that distinction, and the first
-- one inside a detector rather than a payload.

CREATE OR REPLACE VIEW public.admissions_mint_shortfall AS
SELECT
  ol.id                AS order_line_id,
  o.id                 AS order_id,
  o.tenant_id,
  ol.session_id,
  ol.units             AS expected_rows,
  COALESCE(a.minted, 0) AS minted_rows,
  ol.units - COALESCE(a.minted, 0) AS missing_rows,
  o.updated_at         AS order_updated_at
FROM public.order_lines ol
JOIN public.orders o ON o.id = ol.order_id
LEFT JOIN (
  SELECT order_line_id, count(*)::int AS minted
    FROM public.admissions
   WHERE order_line_id IS NOT NULL
   GROUP BY order_line_id
) a ON a.order_line_id = ol.id
WHERE o.status IN ('paid', 'fulfilled')
  AND ol.session_id IS NOT NULL
  AND COALESCE(a.minted, 0) < ol.units;

COMMENT ON VIEW public.admissions_mint_shortfall IS
  'Paid, session-backed order lines that minted fewer admissions than they sold. This is what makes '
  'best-effort minting safe: without it a failed mint is undetectable until a buyer is standing at a '
  'door with a receipt and no ticket. Rows expected = order_lines.units, NOT units * admits_per_unit '
  '-- one VIP table for six is one admission of party_size 6, and comparing against the people count '
  'would report a false shortfall on every table sale.';

-- Staff-only: it exposes tenant order lines. Views run with the definer's
-- rights by default here, so no anon grant of any kind.
REVOKE ALL ON public.admissions_mint_shortfall FROM PUBLIC, anon;
GRANT SELECT ON public.admissions_mint_shortfall TO authenticated;

COMMIT;
