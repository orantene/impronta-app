-- Tables slice (P4) — party size and table joins on an open visit.
--
-- WHY. T05/T07 (spec docs/plans/program/specs/tables.md §3) read
-- `spaces.party_min/party_max` to refuse a party that does not fit. Refusing
-- needs the party size to compare against, and today's `visits` row has
-- nowhere to keep it — a walk-in of four was accepted onto a two-top with no
-- record of who decided that was fine. `party_size` closes that gap.
--
-- T15 (join tables: "T7 and T8 join for a party of 5 to 8") needs a second
-- occupied space for the SAME visit. `space_combinations` (S2,
-- 20261229000221) already records which spaces may join and at what party
-- range; what was missing was somewhere on the visit to say "and this other
-- table too". `joined_space_id` is that: a single extra occupied space,
-- because a bigger join (three tables) is not in this slice's cases and a
-- second FK column is honest about the one join this seating supports rather
-- than inventing a join-set table for a case nobody has asked for yet.
--
-- `visits_one_open_per_space` (20261230000200) already stops a space from
-- carrying two open visits through its own `space_id`. It says nothing about
-- a space sitting in another visit's `joined_space_id`, so that half is
-- covered by a partial unique index here. A space listed as BOTH a primary
-- `space_id` and someone else's `joined_space_id` at once is still possible
-- through two independent indexes; `openVisit` in `lib/visits/commands.ts`
-- closes that with an explicit read-before-write check under this same
-- constraint as the backstop for the race.
--
-- APPLY WITH `npm run journeys:repair -- <file>` on the isolated branch only.
-- Timestamp reserved for the p4-tables slice; do not reuse.

BEGIN;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS party_size integer CHECK (party_size IS NULL OR party_size >= 1);

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS joined_space_id uuid REFERENCES public.spaces(id) ON DELETE SET NULL;

ALTER TABLE public.visits
  DROP CONSTRAINT IF EXISTS visits_joined_space_not_self;

ALTER TABLE public.visits
  ADD CONSTRAINT visits_joined_space_not_self CHECK (joined_space_id IS NULL OR joined_space_id <> space_id);

CREATE UNIQUE INDEX IF NOT EXISTS visits_one_open_per_joined_space
  ON public.visits (joined_space_id)
  WHERE status = 'open' AND joined_space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS visits_joined_space_idx
  ON public.visits (joined_space_id)
  WHERE joined_space_id IS NOT NULL;

COMMENT ON COLUMN public.visits.party_size IS
  'T05/T07: the party this seating was opened for. Compared against spaces.party_min/party_max (and, when joined_space_id is set, the space_combinations row for the pair) at seat time. Null on rows opened before this column existed, and on a bar tab, where nobody is seated as a party.';
COMMENT ON COLUMN public.visits.joined_space_id IS
  'T15: a second physical space occupied by this SAME visit, when two tables were joined to fit one party. The visit still owns exactly one order (L52); joining is a floor-plan fact, never a second occupancy row. visits_one_open_per_joined_space stops that second space from being handed to anyone else while joined.';

-- v3.1-corrections.md, page 45: after a move, the ORIGIN table must never
-- read as a plain "Free" — it is dirty, unbussed, and needs a host to look at
-- it before the next party sits down. `spaces.status` (active/out_of_service)
-- is the wrong axis for this: a table can be perfectly in-service and still
-- need a wipe-down. `needs_reset_at` is the third, independent fact: when it
-- is set the table is unoccupied but not yet ready, and `tablesResetTable`
-- (T24) is the only thing that clears it. Set on the ORIGIN space by a move
-- (T13/T14) and on a visit's space(s) by a close (T23→T24), read by
-- `lib/visits/floor.ts`.
ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS needs_reset_at timestamptz;

COMMENT ON COLUMN public.spaces.needs_reset_at IS
  'Set when a visit stops occupying this space (closed, or moved away from it) — the table is free but not yet reset for the next party. Cleared by the T24 table-reset action. Independent of status: a table can be active and still need a reset.';

COMMIT;
