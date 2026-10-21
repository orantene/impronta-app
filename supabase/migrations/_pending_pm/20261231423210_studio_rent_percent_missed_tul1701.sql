-- TUL-1701 · Months whose percentage of sales the automatic invoice could not carry (already finalized, or the
-- percentage switch was off). HELD in _pending_pm. Additive. Depends on 20261231423010 (TUL-1466).
-- ROLLBACK: ALTER TABLE public.studio_rent_plans DROP COLUMN IF EXISTS autopay_percent_missed;
BEGIN;
ALTER TABLE public.studio_rent_plans ADD COLUMN IF NOT EXISTS autopay_percent_missed text[] NOT NULL DEFAULT '{}';
COMMIT;
