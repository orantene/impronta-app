-- P4-money: the Payments screen must be able to tell CASH from CARD, and the
-- column the till writes that into does not exist in production.
--
-- WHAT WAS REPRODUCED, on the isolated branch, through the real code paths:
-- `settleAtDoor` was called twice for one workspace, once with
-- `paidVia: 'cash'` (1500) and once with `paidVia: 'card'` (2500). Both
-- transactions landed `paid`. Reading them back through the Payments page's
-- own reader and shaper produced ONE bucket:
--
--     [{ "method": "manual_other", "currency": "USD",
--        "totalCents": 4000, "count": 2 }]
--
-- Cash and card were unreachable, and the page said "other" about a drawer
-- with 1500 of notes in it. The rows themselves were fine — each carried
-- `metadata.paid_via` — and the reader was looking in `provider_metadata`,
-- which the till never writes. The reader is corrected in the same commit as
-- this file; this file is why the column it now reads is safe to read.
--
-- PRODUCTION HAS NO `metadata` COLUMN. `information_schema.columns` was read
-- directly against `pluhdapdnuiulvxmyspd`: `booking_transactions` has
-- `provider_metadata` and nothing else matching. No migration in this
-- repository ever created `metadata` — `20260901190000_booking_transactions.sql`
-- defines `provider_metadata JSONB NOT NULL DEFAULT '{}'` and stops there —
-- and the generated types agree with production, so they were never stale.
-- The isolated QA branch has the column out of band, which is why the
-- reproduction above could run there at all.
--
-- WHY THE METHOD BELONGS IN `metadata` AND NOT IN `provider_metadata`. The
-- second bag is the provider's: `markPaid` writes Stripe's
-- `payment_intent_id` into it and a refund reads it back out. How a cashier
-- took the money is not a fact Stripe would recognise, and folding the two
-- together puts a reference refunds depend on in the same bag as a drawer's
-- change, where the next writer to replace rather than merge destroys it.
--
-- FOUR SHIPPED PATHS ALREADY WRITE OR READ `metadata`, so this is a column
-- that is missing rather than a column being invented:
--   · `lib/orders/settle-at-door.ts` writes the whole tender bag —
--     `paid_via`, `shift_id`, `tendered_cents`, `change_cents`.
--   · `lib/pos/collection.ts` writes the collection reservation id.
--   · `lib/pos/shift.ts` reads it to total a drawer, and
--     `20261230000300_pos_shifts.sql` states that contract in its own header.
--   · `lib/bookings/transactions.ts` reads it back when a payment settles.
--
-- DELIBERATELY THE SAME STATEMENT AS `20261231001200_pos_collection_recovery.sql`,
-- which creates this column for the POS recovery slice. Both are
-- `ADD COLUMN IF NOT EXISTS` with an identical type, nullability and default,
-- so either merge order gives the same schema and the second to apply is a
-- no-op. The duplication is on purpose: this branch's Payments screen reads
-- the column, and a screen must not depend on another branch landing first.

BEGIN;

ALTER TABLE public.booking_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.booking_transactions.metadata IS
  'OUR facts about this money row: how it was tendered (paid_via), the POS shift, the cash tendered and the change given, and the collection reservation over the order balance. Provider-owned facts live in provider_metadata; do not merge the two.';

COMMIT;
