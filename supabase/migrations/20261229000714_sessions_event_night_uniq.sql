-- Scheduling the same night twice for one event created TWO sessions and two
-- sets of pools, silently. A 40-seat room became 80 across two identical
-- nights, with every screen agreeing.
--
-- The existing uniqueness is on (series_id, starts_at). An EVENT session has
-- `series_id = NULL`, and Postgres indexes are NULLS DISTINCT by default, so
-- two event sessions never conflict on it. That was true when the index was
-- partial and it stayed true when 20261229000712 made it total: making it total
-- fixed ON CONFLICT planning, it did not make NULLs collide. The event case
-- simply arrived after the index and was never covered.
--
--
-- THE KEY IS (event, instant, VENUE), NOT (event, instant)
-- ═══════════════════════════════════════════════════════
-- This is a modelling decision and it deserves stating, because the narrower
-- key was the obvious one and it is wrong.
--
-- One event may legitimately run in two rooms at the same instant: a festival
-- with a main hall and a side room at 21:00 is two sessions, two capacity
-- pools, one event. A unique key on (event_id, starts_at) forbids that, and it
-- would forbid it silently at the moment a venue first tried to sell it, which
-- is the worst time to discover a schema opinion.
--
-- Including `venue_id` refuses the actual defect — the SAME night in the SAME
-- room entered twice — while leaving the legitimate case expressible.
--
-- NULLS NOT DISTINCT is load-bearing and is the whole reason this needs PG 15+
-- (we are on 17). Without it a venueless event session would carry
-- `venue_id = NULL`, NULLs would not collide, and this index would repeat the
-- exact failure it exists to fix — an index that looks like a guarantee and
-- covers nothing. That is the third time this shape has cost this area.
--
-- WHEN SPACES SHIPS ROOMS WITHIN A VENUE, this key needs `space_id` too: two
-- rooms in ONE venue at one instant will collide under it. That is a deliberate
-- known limit, not an oversight, and it is a smaller wrong than forbidding two
-- rooms outright today.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_event_night_uniq
  ON public.sessions (event_id, starts_at, venue_id)
  NULLS NOT DISTINCT
  WHERE event_id IS NOT NULL;

COMMENT ON INDEX public.sessions_event_night_uniq IS
  'One event night per room. NULLS NOT DISTINCT so a venueless event session is still covered; without it NULL venue_id would never collide and this index would guarantee nothing. Deliberately includes venue_id: one event may run two rooms at one instant. Needs space_id when Spaces ships rooms within a venue.';

COMMIT;
