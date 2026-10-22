-- TUL-1309 (money): order_lines.units must be a whole number.
--
-- HELD: lives in _pending_pm. NOT applied by the builder. The Production Migration Manager
-- applies it after merge, in two steps (below).
--
-- order_lines.units is NUMERIC(12,3) with only CHECK (units > 0). The purchase pipeline,
-- pricing and the POS draft now refuse a part quantity (#4092, TUL-1268 M9), and the messaging
-- confirm plan and POS admission holders refuse it too (TUL-1309), but nothing at the database
-- stops a stray writer from storing 2.5. Every hold is an integer (capacity_allocations.units),
-- so a 2.5 line sells half a unit of stock that was never reserved.
--
-- STEP 1 (this file): the constraint is added NOT VALID. It is enforced for every NEW or UPDATED
--   row immediately and does not scan or reject the rows already there, so it cannot fail on
--   history.
-- STEP 2 (run by hand AFTER the read-only count below returns 0, or after the listed rows are fixed):
--     ALTER TABLE public.order_lines VALIDATE CONSTRAINT order_lines_units_whole;
--
-- Count first (read-only):
--     SELECT count(*) FROM public.order_lines WHERE units <> trunc(units);
--
-- Rollback: ALTER TABLE public.order_lines DROP CONSTRAINT order_lines_units_whole;

BEGIN;

ALTER TABLE public.order_lines
  DROP CONSTRAINT IF EXISTS order_lines_units_whole;
ALTER TABLE public.order_lines
  ADD CONSTRAINT order_lines_units_whole CHECK (units = trunc(units)) NOT VALID;

COMMENT ON CONSTRAINT order_lines_units_whole ON public.order_lines IS
  'TUL-1309: a line sells whole units; holds are integers. Added NOT VALID, validate after the violating-row count.';

COMMIT;
