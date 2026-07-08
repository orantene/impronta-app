-- Reserve modes (W2-A): the TALENT chooses what a direct booking collects
-- up front —
--   full    → pay the whole (surcharge-inclusive) total to reserve  [default]
--   deposit → pay deposit_pct now, balance later (existing deposit/balance rail)
--   free    → reserve without payment; staff request payment later / at the
--             appointment (pairs with allow_pay_in_person for cash)
ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS reserve_mode text NOT NULL DEFAULT 'full'
    CHECK (reserve_mode IN ('full','deposit','free')),
  ADD COLUMN IF NOT EXISTS deposit_pct int
    CHECK (deposit_pct IS NULL OR (deposit_pct > 0 AND deposit_pct < 100));

-- A deposit reserve needs a percentage.
ALTER TABLE public.talent_offerings
  ADD CONSTRAINT talent_offerings_deposit_needs_pct
  CHECK (reserve_mode <> 'deposit' OR deposit_pct IS NOT NULL);
