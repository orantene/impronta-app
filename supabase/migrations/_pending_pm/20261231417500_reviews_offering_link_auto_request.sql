-- G2 (services execution plan 2026-10-19): reviews are tied to the service, and
-- the automatic review request after a completed booking is recorded once.
--
-- HELD: lives in _pending_pm. Never applied by an agent. ADDITIVE ONLY: every
-- statement is IF NOT EXISTS; the app code reads/writes these columns in their
-- own best-effort statements, so code merged before this applies degrades to
-- "no service link" and a logged error, never a failed page or submit.
--
-- Rollback: DROP INDEX review_requests_auto_once_idx, talent_reviews_offering_idx;
--           ALTER TABLE review_requests DROP COLUMN source, DROP COLUMN offering_id;
--           ALTER TABLE talent_reviews DROP COLUMN offering_id;

BEGIN;

-- 1. Review -> service. NULL for reviews of a booking with no sold offering.
ALTER TABLE public.talent_reviews
  ADD COLUMN IF NOT EXISTS offering_id uuid
    REFERENCES public.talent_offerings (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS talent_reviews_offering_idx
  ON public.talent_reviews (offering_id)
  WHERE offering_id IS NOT NULL;

-- talent_reviews SELECT is column-granted (20261110070000): a new column is
-- fail-closed until granted. offering_id is not private (it is the public
-- service the review is about), so grant it deliberately.
GRANT SELECT (offering_id) ON public.talent_reviews TO anon, authenticated;

-- 2. Request -> service, and where the request came from.
ALTER TABLE public.review_requests
  ADD COLUMN IF NOT EXISTS offering_id uuid
    REFERENCES public.talent_offerings (id) ON DELETE SET NULL;

ALTER TABLE public.review_requests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_requests_source_check'
  ) THEN
    ALTER TABLE public.review_requests
      ADD CONSTRAINT review_requests_source_check CHECK (source IN ('manual', 'auto'));
  END IF;
END $$;

-- 3. Idempotency: at most ONE automatic request per booking, enforced by the
-- database. A re-run of the sweep, or two overlapping runs, collapse to one.
CREATE UNIQUE INDEX IF NOT EXISTS review_requests_auto_once_idx
  ON public.review_requests (booking_id)
  WHERE source = 'auto' AND booking_id IS NOT NULL;

COMMIT;
