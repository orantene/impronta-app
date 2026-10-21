-- TUL-1611 · Refunds and lost disputes on an automatic rent charge. HELD in _pending_pm. Additive; a NEW migration
-- because 20261231420700 is already on staging. Depends on 20261231423000 (TUL-1601).
-- Money that went back on a rent subscription charge is recorded on the (plan, month) row: how much was refunded, when
-- a dispute opened and when it was lost. A fully refunded month gets the new status 'refunded'.
--
-- ROLLBACK (no 'refunded' row may exist): ALTER TABLE public.studio_rent_invoices DROP COLUMN IF EXISTS refunded_cents,
--   DROP COLUMN IF EXISTS disputed_at, DROP COLUMN IF EXISTS dispute_lost_at; and restore the old status check.

BEGIN;

ALTER TABLE public.studio_rent_invoices
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dispute_lost_at timestamptz NULL;

ALTER TABLE public.studio_rent_invoices DROP CONSTRAINT IF EXISTS studio_rent_invoices_status_check;
ALTER TABLE public.studio_rent_invoices
  ADD CONSTRAINT studio_rent_invoices_status_check
    CHECK (status IN ('issuing','issued','paid','failed','void','refunded'));

COMMIT;
