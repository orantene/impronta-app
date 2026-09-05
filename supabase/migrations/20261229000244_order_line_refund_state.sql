-- 0.8b — per-line refund state.
--
-- The order status enum already has `refunded` and `partially_refunded`, but
-- only at the ORDER level. Refund-by-line needs to know how much of EACH line
-- has been returned, and without it refunding the same line twice is
-- undetectable: both attempts see an order that is merely "partially_refunded"
-- and both look legitimate.
--
-- This is the smallest thing that makes a second refund of one line refusable.

ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS refunded_cents BIGINT NOT NULL DEFAULT 0;

-- A line can never be refunded for more than it was charged. This is the
-- invariant the whole slice protects: the discount apportionment exists so a
-- discounted line returns its NET share, and refunding gross would breach this
-- CHECK rather than quietly overpaying — which is the correct place to find out.
ALTER TABLE public.order_lines
  DROP CONSTRAINT IF EXISTS order_lines_refunded_within_total;
ALTER TABLE public.order_lines
  ADD CONSTRAINT order_lines_refunded_within_total
  CHECK (refunded_cents >= 0 AND refunded_cents <= total_cents);

COMMENT ON COLUMN public.order_lines.refunded_cents IS
  'Cents returned for this line, cumulative across partial refunds. NET of any '
  'promo discount: a line discounted 20%% can only ever return 80%% of its '
  'total_cents, because that is what the customer paid for it. Written only by '
  'the refund-by-line path.';
