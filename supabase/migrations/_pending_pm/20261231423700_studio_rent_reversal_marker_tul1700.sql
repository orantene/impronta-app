-- TUL-1700 · A rent refund/dispute whose share reversal could not be made (a permanent Stripe refusal) is marked on the
-- (plan, month) row so a reconcile job or the owner support view can find it, instead of Stripe retrying for 3 days.
-- HELD in _pending_pm. Additive. Depends on 20261231423040 (TUL-1611).
--
-- ROLLBACK: ALTER TABLE public.studio_rent_invoices DROP COLUMN IF EXISTS reversal_failed_at;

BEGIN;

ALTER TABLE public.studio_rent_invoices
  ADD COLUMN IF NOT EXISTS reversal_failed_at timestamptz NULL;

COMMIT;
