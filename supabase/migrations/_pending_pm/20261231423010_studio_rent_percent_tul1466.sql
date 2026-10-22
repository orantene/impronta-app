-- TUL-1466 · Rent can be a percentage of the member's sales (fixed, percent, or both). HELD in _pending_pm.
--
-- 20261231420700 (TUL-1376) is on main and staging, so this is a NEW migration, never an edit of that file.
-- Additive plus three relaxed/tightened checks on studio_rent_plans:
--   * monthly_rent_cents may be 0 (a percentage-only plan) -> >= 0, and at least one of fixed / percent is owed.
--   * rent_percent_bps (0..9000: the studio's cut is at most 90%, the member keeps at least 10%).
--   * accepted_percent_bps records what the member agreed to; an active/paused plan must carry it.
-- Existing accepted plans are backfilled with accepted_percent_bps = 0 (they were fixed-rent only), so the stricter
-- "accepted" check below holds for every existing row before it is added.
--
-- ROLLBACK (only valid while no percentage plan exists):
--   ALTER TABLE public.studio_rent_plans DROP CONSTRAINT IF EXISTS studio_rent_plans_something_owed;
--   ALTER TABLE public.studio_rent_plans DROP COLUMN IF EXISTS rent_percent_bps, DROP COLUMN IF EXISTS accepted_percent_bps;
--   (and restore monthly_rent_cents > 0 / accepted_amount_cents > 0 and the old studio_rent_plans_accepted check)

BEGIN;

ALTER TABLE public.studio_rent_plans
  ADD COLUMN IF NOT EXISTS rent_percent_bps integer NOT NULL DEFAULT 0
    CHECK (rent_percent_bps >= 0 AND rent_percent_bps <= 9000),
  ADD COLUMN IF NOT EXISTS accepted_percent_bps integer NULL
    CHECK (accepted_percent_bps IS NULL OR (accepted_percent_bps >= 0 AND accepted_percent_bps <= 9000));

UPDATE public.studio_rent_plans
   SET accepted_percent_bps = 0
 WHERE accepted_at IS NOT NULL AND accepted_percent_bps IS NULL;

ALTER TABLE public.studio_rent_plans DROP CONSTRAINT IF EXISTS studio_rent_plans_monthly_rent_cents_check;
ALTER TABLE public.studio_rent_plans
  ADD CONSTRAINT studio_rent_plans_monthly_rent_cents_check
    CHECK (monthly_rent_cents >= 0 AND monthly_rent_cents <= 100000000);

ALTER TABLE public.studio_rent_plans DROP CONSTRAINT IF EXISTS studio_rent_plans_accepted_amount_cents_check;
ALTER TABLE public.studio_rent_plans
  ADD CONSTRAINT studio_rent_plans_accepted_amount_cents_check
    CHECK (accepted_amount_cents IS NULL OR accepted_amount_cents >= 0);

ALTER TABLE public.studio_rent_plans DROP CONSTRAINT IF EXISTS studio_rent_plans_something_owed;
ALTER TABLE public.studio_rent_plans
  ADD CONSTRAINT studio_rent_plans_something_owed CHECK (monthly_rent_cents > 0 OR rent_percent_bps > 0);

ALTER TABLE public.studio_rent_plans DROP CONSTRAINT IF EXISTS studio_rent_plans_accepted;
ALTER TABLE public.studio_rent_plans
  ADD CONSTRAINT studio_rent_plans_accepted CHECK (
    status NOT IN ('active','paused')
    OR (accepted_at IS NOT NULL AND accepted_terms_version IS NOT NULL
        AND accepted_amount_cents IS NOT NULL AND accepted_percent_bps IS NOT NULL AND accepted_currency IS NOT NULL)
  );

COMMIT;
