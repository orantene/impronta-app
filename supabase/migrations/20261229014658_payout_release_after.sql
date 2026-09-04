-- A payout leg can be blocked by TIME as well as by account readiness.
--
-- THE HAZARD, caught at design rather than in production. `booking_payouts`
-- has 20 columns and not one of them is a time gate. `status = 'held'` means
-- exactly one thing today: "the payee's account cannot receive yet." That
-- condition is legitimately resolved by an `account.updated` webhook flipping
-- the payee to payouts-enabled, or by the reconcile cron.
--
-- Ticketing needs a second, unrelated reason to withhold: "the show has not
-- happened yet." If that were expressed as `status = 'held'`, then the next
-- account flip or the next cron run would release the money BEFORE THE SHOW.
-- Nothing errors. Nobody looks, because "held, then released" is precisely what
-- that path exists to do. The only signal would be that it worked.
--
-- WHY A COLUMN AND NOT A NEW STATUS. The two conditions are ORTHOGONAL, not
-- alternative: a leg can be blocked by account readiness AND by time at the
-- same moment. A status field is structurally incapable of carrying both -- it
-- can only say one thing -- so a `scheduled` state would have to lie about
-- whichever condition it was not currently naming. A nullable timestamp
-- alongside the existing status expresses both independently, and each is
-- cleared by the thing that actually resolves it.
--
-- NULLABLE, WHERE NULL MEANS DUE NOW. Every existing leg is untouched and this
-- is a non-event for the current ledger: no backfill, nothing to reason about,
-- no behaviour change for any row that exists today.
--
-- The fail-open risk that nullability creates -- a producer forgetting to set
-- it, and the leg releasing immediately -- is closed in TypeScript rather than
-- here: `PayoutLeg.releaseAfter` is a REQUIRED field, so omitting it is a
-- compile error at the single writer. Enforcing NOT NULL in the database would
-- have bought the same safety at the cost of a backfill and a migration every
-- existing call site had to reason about.

ALTER TABLE public.booking_payouts
  ADD COLUMN IF NOT EXISTS release_after TIMESTAMPTZ;

COMMENT ON COLUMN public.booking_payouts.release_after IS
  'Earliest time this leg may be transferred. NULL means due now. Independent of `status`: a leg can be blocked by account readiness (status=held) and by time (release_after in the future) simultaneously, which is why this is a column and not a status. A hold may be EXTENDED by a later write, never shortened or removed by routine bookkeeping.';

-- Partial index: the release path filters on exactly this shape, and only
-- gated rows are worth indexing -- the overwhelming majority are NULL.
CREATE INDEX IF NOT EXISTS idx_booking_payouts_release_after
  ON public.booking_payouts (release_after)
  WHERE release_after IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'booking_payouts'
      AND column_name = 'release_after'
  ) THEN
    RAISE EXCEPTION 'release_after was not added to booking_payouts';
  END IF;

  -- The whole point of nullable-means-due-now: nothing that exists today may
  -- have acquired a gate from this migration.
  IF EXISTS (SELECT 1 FROM public.booking_payouts WHERE release_after IS NOT NULL) THEN
    RAISE EXCEPTION 'existing payout legs acquired a release gate — this migration must be a non-event';
  END IF;
END $$;
