-- TUL-1693 (follow-up to TUL-1591 (e), PR #4241): the owner's "Who stays visible" pick gets
-- its own state. It used to reuse agency_visibility = 'featured', but featured also drives
-- the theme badge and featured listings, so a pick changed unrelated listings.
-- Additive only. Default false = nobody is kept, which is what the screen shows while this
-- is not applied (the app fails closed on the missing column).
-- HELD in _pending_pm until the PM schedules it; the code ships safe without it.

BEGIN;

ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS keep_visible boolean NOT NULL DEFAULT false;

-- 422700 revokes table-level SELECT on agency_talent_roster from anon and authenticated and
-- re-grants only the columns that existed then. Without this grant the public directory's read
-- of keep_visible fails with 42501 (not "column missing"), so owner picks would be ignored.
GRANT SELECT (keep_visible) ON public.agency_talent_roster TO anon, authenticated;

COMMENT ON COLUMN public.agency_talent_roster.keep_visible IS
  'Owner pick (Settings > Who stays visible): keep this member on the public site when the roster is over the plan cap. Independent of agency_visibility; never implies featured. Default false.';

COMMIT;
