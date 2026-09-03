-- Reservations R1 — service windows, their exceptions, and the venue's rules.
--
-- Band `20261229000380`–`…000399`, announced to the Director before applying.
--
-- WHY A WINDOW IS NOT A `sessions` ROW
-- `sessions` is documented in 20261229000214 as "One occurrence. The only
-- bookable thing, and the subject of session_tier capacity pools." A service
-- window is neither: nobody books a window, they book a table inside one, and
-- the pool belongs to the party-size band while an allocation is a turn
-- floating inside the window. Putting a window in that table would make the
-- table's own comment false. This question moved four times across three
-- sessions in one afternoon while everyone weighed row count against
-- machinery; it is settled here on what a session IS, because a question
-- settled by weighing reopens. Full argument: docs/plans/reservations-plan.md
-- §0 C6.
--
-- WHY A START PLUS A LENGTH, NOT A START AND AN END
-- web/src/lib/scheduling/hours-types.ts:65-68 refuses any window with
-- `endMin > 1440` or `endMin <= startMin`, so a club's 23:00 to 05:00 service
-- is unrepresentable in the weekly-hours shape. A window that is a wall clock
-- plus a duration never has to name an end inside a civil day.
--
-- WHY EXCEPTIONS ARE A TABLE AND NOT MATERIALISED OCCURRENCES
-- A restaurant's service varies constantly — closed 25 December, New Year's Eve
-- to 02:00, brunch only this Sunday. That needs a row per VARIED date, roughly
-- ten a year per venue, not a row per date, which is seven hundred and thirty.
--
-- DST, WHICH IS WHERE THIS AREA GETS EXPENSIVE
-- `local_time` is a WALL CLOCK, never an instant: adding seven days to an
-- instant drifts across a transition. Resolution goes through
-- lib/sessions/recurrence.ts, and the gap policy is named at each call site
-- because a window needs BOTH — its own boundaries resolve "next" (if dinner's
-- start lands in the spring-forward gap, refusing closes a restaurant whose
-- doors are open), while an offered seating resolves "skip" (a 02:30 seating
-- moved to 03:30 collides with the real 03:30 seating, and the page then offers
-- one instant twice under two labels).
--
-- Every duration is added to the INSTANT, never to the wall clock. Measured on
-- this repo: a 90 minute turn from a 01:30 seating, computed on the wall clock,
-- holds the table for 30 real minutes on spring-forward night and frees it
-- while the party is still eating.
--
-- WHAT IS DELIBERATELY NOT HERE
-- Overbooking is `capacity_pools.overbook_units` and stays there; storing it
-- again would give two answers. Table groups, party bands and turn overrides
-- per table are the Spaces & Seating Manager's (`spaces.turn_minutes`).
--
-- Rollback: drop the three tables. Nothing references them.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

-- ─── 1. the rule: dinner, 19:00, four hours, seven nights ───────────────────

CREATE TABLE IF NOT EXISTS public.venue_service_windows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id         UUID NOT NULL REFERENCES public.venues(id)   ON DELETE CASCADE,

  key              TEXT NOT NULL CHECK (key ~ '^[a-z][a-z0-9_-]{0,31}$'),
  -- { "en": "Dinner", "es": "Cena" }. The shown word is the workspace's; this
  -- is the window's own name, which a venue may set per language.
  label            JSONB NOT NULL DEFAULT '{}'::jsonb,

  local_time       TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 1440),

  -- ISO weekdays, 1 = Monday … 7 = Sunday, matching Postgres `isodow`.
  -- cardinality(), NOT array_length(): array_length of an empty array is NULL,
  -- `NULL BETWEEN 1 AND 7` is NULL, and a CHECK accepts NULL — so the obvious
  -- version silently permits ARRAY[]::int[], a window that opens on no day,
  -- with nobody finding out until a page offers no times. Learned from the
  -- header of 20261229000214, where it cost someone else the discovery.
  weekdays         INTEGER[] NOT NULL
                     CHECK (cardinality(weekdays) BETWEEN 1 AND 7
                            AND weekdays <@ ARRAY[1,2,3,4,5,6,7]),

  -- Minutes after local_time. NULL means "the window's end, minus this party's
  -- turn", which is a different statement from 0, which means "this window
  -- takes no seatings at all". Nullable rather than defaulted so absence stays
  -- structurally distinct from a value.
  last_seating_offset_min INTEGER CHECK (last_seating_offset_min IS NULL
                                         OR last_seating_offset_min >= 0),
  seating_step_minutes    INTEGER NOT NULL DEFAULT 15
                            CHECK (seating_step_minutes BETWEEN 5 AND 120),
  turn_minutes_override   INTEGER CHECK (turn_minutes_override IS NULL
                                         OR turn_minutes_override > 0),

  starts_on        DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on          DATE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT venue_service_windows_date_order
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

COMMENT ON TABLE public.venue_service_windows IS
  'Reservations R1: a recurring service window on a venue (lunch, dinner). A wall clock plus a duration, never a pair of minutes in a civil day, so a window may cross midnight. Not a session: nobody books a window, they book a table inside one.';
COMMENT ON COLUMN public.venue_service_windows.local_time IS
  'Wall clock in the venue timezone. NOT an instant. Resolved per date through lib/sessions/recurrence.ts with the gap policy named at the call site.';
COMMENT ON COLUMN public.venue_service_windows.last_seating_offset_min IS
  'NULL = the window end minus this party''s turn time. 0 = no seatings at all. The two are different statements and must stay distinguishable.';

CREATE UNIQUE INDEX IF NOT EXISTS venue_service_windows_key_uniq
  ON public.venue_service_windows (venue_id, key);
CREATE INDEX IF NOT EXISTS venue_service_windows_tenant_idx
  ON public.venue_service_windows (tenant_id) WHERE is_active;

-- ─── 2. the variation: about ten rows a year per venue ──────────────────────

CREATE TABLE IF NOT EXISTS public.venue_service_window_exceptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id         UUID NOT NULL REFERENCES public.venues(id)   ON DELETE CASCADE,
  -- NULL = the whole venue is shut that day, which is one row rather than one
  -- per window, and stays correct when a window is added later.
  window_id        UUID REFERENCES public.venue_service_windows(id) ON DELETE CASCADE,

  on_date          DATE NOT NULL,
  is_closed        BOOLEAN NOT NULL DEFAULT FALSE,

  -- Overrides. NULL means inherit, which is why none of them is defaulted: a 0
  -- in any of these means something specific.
  local_time              TIME,
  duration_minutes        INTEGER CHECK (duration_minutes IS NULL
                                         OR duration_minutes BETWEEN 15 AND 1440),
  last_seating_offset_min INTEGER CHECK (last_seating_offset_min IS NULL
                                         OR last_seating_offset_min >= 0),

  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A closure overrides nothing and an override closes nothing. Allowing both
  -- on one row gives a date two readings, and whichever the reader checks first
  -- wins.
  CONSTRAINT venue_service_window_exceptions_closed_xor_override CHECK (
    NOT is_closed
    OR (local_time IS NULL
        AND duration_minutes IS NULL
        AND last_seating_offset_min IS NULL))
);

COMMENT ON TABLE public.venue_service_window_exceptions IS
  'Reservations R1: one row per VARIED date, not per date. Closed 25 December, New Year''s Eve to 02:00, brunch only this Sunday. A NULL window_id closes the whole venue for that date.';

-- A venue-wide closure and a per-window override are different rows for one
-- date, so the uniqueness key has to treat NULL window_id as a value. Postgres
-- unique indexes let duplicate NULLs through, which would allow two
-- contradictory venue-wide rows for one day.
CREATE UNIQUE INDEX IF NOT EXISTS venue_service_window_exceptions_uniq
  ON public.venue_service_window_exceptions
     (venue_id, on_date, COALESCE(window_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS venue_service_window_exceptions_date_idx
  ON public.venue_service_window_exceptions (venue_id, on_date);

-- ─── 3. the venue's reservation rules ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.venue_service_rules (
  venue_id            UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES public.agencies(id)  ON DELETE CASCADE,
  is_active           BOOLEAN NOT NULL DEFAULT FALSE,

  party_size_min      INTEGER NOT NULL DEFAULT 1 CHECK (party_size_min >= 1),
  party_size_max      INTEGER NOT NULL DEFAULT 8 CHECK (party_size_max >= party_size_min),
  horizon_days        INTEGER NOT NULL DEFAULT 60  CHECK (horizon_days BETWEEN 1 AND 365),
  min_notice_minutes  INTEGER NOT NULL DEFAULT 120 CHECK (min_notice_minutes >= 0),

  -- [{ "minParty":1, "maxParty":2, "turnMinutes":75 }, ...] Ordered and
  -- non-overlapping. Parsed fail-closed: a malformed blob yields
  -- default_turn_minutes for every party and never a guessed turn.
  turn_time_bands      JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_turn_minutes INTEGER NOT NULL DEFAULT 90
                         CHECK (default_turn_minutes BETWEEN 15 AND 720),

  -- May a party of two book a four-top when the two-tops are gone? Refusing
  -- outright is a lost cover and the host works around it; offering by default
  -- burns a four-top on a deuce at 20:00 on a Saturday. So it is a policy with
  -- an honest default: false online, and always true at the host stand, where a
  -- human is looking at the room.
  allow_public_upsize BOOLEAN NOT NULL DEFAULT FALSE,

  -- NULL thresholds mean NEVER ASK, which is a different statement from a
  -- number, and must not be spelled with a sentinel.
  card_on_file_from_party  INTEGER CHECK (card_on_file_from_party IS NULL
                                          OR card_on_file_from_party >= 1),
  no_show_fee_cents        BIGINT NOT NULL DEFAULT 0 CHECK (no_show_fee_cents >= 0),
  no_show_fee_basis        TEXT NOT NULL DEFAULT 'per_person'
                             CHECK (no_show_fee_basis IN ('per_person','per_party')),
  no_show_grace_minutes    INTEGER NOT NULL DEFAULT 30
                             CHECK (no_show_grace_minutes BETWEEN 0 AND 240),
  deposit_from_party       INTEGER CHECK (deposit_from_party IS NULL
                                          OR deposit_from_party >= 1),
  deposit_cents_per_person BIGINT NOT NULL DEFAULT 0
                             CHECK (deposit_cents_per_person >= 0),
  free_cancel_hours        NUMERIC(5,2) NOT NULL DEFAULT 2
                             CHECK (free_cancel_hours >= 0),

  waitlist_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  walkins_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  notes_enabled       BOOLEAN NOT NULL DEFAULT TRUE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venue_service_rules IS
  'Reservations R1: one row per venue. Party sizes, turn times, notice, deposits and no-show policy. Overbooking is deliberately absent: it is capacity_pools.overbook_units, and storing it twice would give two answers.';
COMMENT ON COLUMN public.venue_service_rules.card_on_file_from_party IS
  'NULL = never ask for a card. Not 0 and not a large sentinel: absence has to be structurally distinct from a threshold.';

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────
-- Staff read their own workspace's rules. Writes are service-role only, like
-- the rest of the operational schema. No anon policy: the public reserve block
-- renders through a server component that already holds the rows and calls
-- capacity_remaining_public for the numbers, never by querying these from a
-- browser.

ALTER TABLE public.venue_service_windows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_service_window_exceptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_service_rules              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_service_windows_select_staff ON public.venue_service_windows;
CREATE POLICY venue_service_windows_select_staff ON public.venue_service_windows
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS venue_service_window_exceptions_select_staff
  ON public.venue_service_window_exceptions;
CREATE POLICY venue_service_window_exceptions_select_staff
  ON public.venue_service_window_exceptions
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS venue_service_rules_select_staff ON public.venue_service_rules;
CREATE POLICY venue_service_rules_select_staff ON public.venue_service_rules
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

GRANT SELECT ON TABLE public.venue_service_windows           TO authenticated;
GRANT SELECT ON TABLE public.venue_service_window_exceptions TO authenticated;
GRANT SELECT ON TABLE public.venue_service_rules             TO authenticated;

GRANT ALL ON TABLE public.venue_service_windows           TO service_role;
GRANT ALL ON TABLE public.venue_service_window_exceptions TO service_role;
GRANT ALL ON TABLE public.venue_service_rules             TO service_role;

COMMIT;
