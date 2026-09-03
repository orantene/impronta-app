-- 20261229000214_sessions_and_series.sql — Sessions & Classes P1.1.
--
-- Two tables and a registry row. No behaviour changes: nothing reads these yet.
-- Plan: docs/plans/sessions-classes-plan.md (on main at 75b6dfee9).
--
-- A SERIES IS A DEFINITION; A SESSION IS AN OCCURRENCE. Only the occurrence is
-- ever bookable, and only the occurrence carries a capacity pool. The series is
-- materialised forward by cron (P1.2) and is never itself sold.
--
--
-- WHY local_time IS A `time` AND NOT A `timestamptz`
-- ═════════════════════════════════════════════════
-- "Tuesdays at 18:00" is a statement about a clock on a wall in a place. It is
-- NOT a fixed number of milliseconds from any other occurrence: a daylight
-- saving transition moves the wall clock relative to UTC, so materialising by
-- adding seven days to the previous instant silently produces a class at 17:00
-- or 19:00 local for half the year. Silent, because every timestamp it produces
-- is valid and the series looks right in UTC until a customer arrives an hour
-- late.
--
-- So the series stores a wall clock plus a zone, and each occurrence resolves it
-- independently. `web/src/lib/sessions/recurrence.ts` is that resolver, and its
-- tests assert the naive expansion drifts while this one does not.
--
-- The zone comes from the venue (`venues.timezone`, Spaces S1), falling back to
-- `agencies.timezone`. Neither is duplicated here.
--
--
-- A TIER IS NOT A TABLE
-- ════════════════════
-- There is deliberately no `session_tiers` table. A tier is a capacity pool:
--
--   subject_kind = 'session_tier'   subject_id = the session   pool_key = tier
--
-- `capacity_pools` is unique on (tenant_id, subject_kind, subject_id, pool_key),
-- so one session carries GA and VIP as two rows with no join. A house cap across
-- tiers is the PARENT pool, and the ancestor rule then refuses 150 GA + 60 VIP at
-- 201 with `ancestor_full` without either tier knowing the other exists.
--
--
-- EVERY ALLOCATION MUST CARRY THE SESSION'S WINDOW
-- ═══════════════════════════════════════════════
-- Even though the pool is already per-session, so a timeless allocation LOOKS
-- sufficient. It is sufficient only while the pool has no ancestor shared across
-- time. The moment a tier pool hangs under a room pool — which is what Spaces
-- ships next — a timeless allocation charges that room FOREVER, and a Tuesday
-- class blocks Saturday's event in the same room. That failure surfaces months
-- later, in a different feature, and looks like Spaces' bug.
--
-- It costs nothing when the pool is parentless, so the rule is unconditional.
-- It is ENFORCED rather than documented: `web/src/lib/sessions/tier-pools.ts`
-- builds reserve requests from a session, so a caller cannot construct a
-- timeless one — the signature takes a session, not a window. A comment saying
-- "always pass the window" is obeyed until the first person in a hurry.
--
--
-- TIMESTAMP: band 202612290002xx (Capacity). Verified against the REMOTE ledger:
-- 200/210/211/212/213 mine, 220-223 Spaces, 240-242 Orders, 400, 500. 214 free.
-- The check that matters more: everything this depends on sorts BELOW it —
-- `capacity_subject_kinds` is at 212, so a rebuild from scratch in filename order
-- creates the table before this INSERT looks for it.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs`, never `db push`.
-- DRY-RUN FIRST with `npm run sql:dry-run -- <this file>`.

BEGIN;

-- ─── 1. session_series — the definition ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_series (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id         uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  offering_id      uuid REFERENCES public.talent_offerings(id) ON DELETE SET NULL,
  title            text NOT NULL CHECK (length(btrim(title)) > 0),
  -- A wall clock, never an instant. See the header.
  local_time       time NOT NULL,
  duration_minutes int  NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  -- ISO weekdays, 1 = Monday … 7 = Sunday, matching Postgres `isodow` and the
  -- TypeScript resolver. Non-empty and in range, or the series expands to
  -- nothing and nobody finds out until the cron produces no occurrences.
  -- cardinality(), NOT array_length(): array_length of an empty array is NULL,
  -- and `NULL BETWEEN 1 AND 7` is NULL, which a CHECK constraint accepts. So the
  -- obvious version silently permits `ARRAY[]::int[]` — a series that expands to
  -- no occurrences, with nobody finding out until the cron produces nothing.
  -- (`weekdays <@ ARRAY[1..7]` does not save it either: the empty set is a
  -- subset of everything.) Caught by dry-running this migration before applying.
  weekdays         int[] NOT NULL
                     CHECK (cardinality(weekdays) BETWEEN 1 AND 7
                            AND weekdays <@ ARRAY[1,2,3,4,5,6,7]),
  seats            int  NOT NULL CHECK (seats >= 0),
  starts_on        date NOT NULL,
  ends_on          date,                     -- NULL = open-ended
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_series_date_order CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS session_series_tenant_idx
  ON public.session_series (tenant_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS session_series_offering_idx
  ON public.session_series (offering_id) WHERE offering_id IS NOT NULL;

COMMENT ON TABLE public.session_series IS
  'Recurring definition. Materialised forward by cron; never itself bookable.';
COMMENT ON COLUMN public.session_series.local_time IS
  'Wall clock in the venue timezone. NOT an instant — adding 7 days to an instant drifts across DST.';

-- ─── 2. sessions — the occurrence ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL, not CASCADE: deleting a series must never delete the
  -- occurrences people already bought. A sold session is history.
  series_id   uuid REFERENCES public.session_series(id) ON DELETE SET NULL,
  venue_id    uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  offering_id uuid REFERENCES public.talent_offerings(id) ON DELETE SET NULL,
  title       text,                          -- NULL inherits the series title
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','cancelled','completed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_range CHECK (ends_at > starts_at)
);

-- The materialiser must be re-runnable without duplicating an occurrence, which
-- is what makes the P1.2 cron idempotent rather than merely careful.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_series_occurrence_uniq
  ON public.sessions (series_id, starts_at) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_tenant_starts_idx
  ON public.sessions (tenant_id, starts_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS sessions_offering_starts_idx
  ON public.sessions (offering_id, starts_at) WHERE offering_id IS NOT NULL;

COMMENT ON TABLE public.sessions IS
  'One occurrence. The only bookable thing, and the subject of session_tier capacity pools.';

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
-- A published session is public information: a visitor has to see that the class
-- exists and when. Remaining seats are NOT read from here — that is
-- capacity_remaining_public, which returns one integer and never a row.

ALTER TABLE public.session_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_series_select_staff ON public.session_series;
CREATE POLICY session_series_select_staff ON public.session_series
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS sessions_select_staff ON public.sessions;
CREATE POLICY sessions_select_staff ON public.sessions
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS sessions_select_public ON public.sessions;
CREATE POLICY sessions_select_public ON public.sessions
  FOR SELECT TO anon, authenticated USING (status = 'scheduled');

-- No write policy of any kind on either table: writes are service-role only,
-- through the materialiser and the editor, exactly as capacity_pools works.
REVOKE ALL ON TABLE public.session_series FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sessions       FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.session_series TO authenticated;
GRANT SELECT ON TABLE public.sessions       TO anon, authenticated;

-- ─── 4. touch triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sessions_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_series_touch ON public.session_series;
CREATE TRIGGER session_series_touch BEFORE UPDATE ON public.session_series
  FOR EACH ROW EXECUTE FUNCTION public.sessions_touch();

DROP TRIGGER IF EXISTS sessions_touch ON public.sessions;
CREATE TRIGGER sessions_touch BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.sessions_touch();

REVOKE ALL ON FUNCTION public.sessions_touch() FROM PUBLIC, anon, authenticated;

-- ─── 5. close the registry ──────────────────────────────────────────────────
-- `session_tier` was the LAST unvalidated subject kind. With this, every kind in
-- the CHECK constraint has a backing table and `upsert_capacity_pool` refuses a
-- pool pointing at a session that does not exist. The unregistered list in
-- subject-registry.static.test.ts becomes EMPTY, which it has never been.

INSERT INTO public.capacity_subject_kinds (subject_kind, table_name, registered_by)
VALUES ('session_tier', 'sessions', 'sessions-P1.1')
ON CONFLICT (subject_kind) DO NOTHING;

COMMIT;
