-- Phase 2 · E2 — a ticket tier IS a catalog variant. Nine additive columns.
--
-- Ticketing is not a product line and it gets no tier table of its own. A tier
-- is `talent_offering_variants` -- a row that already carries a label, a price
-- and a sort order -- plus the few things a TICKET needs that a size or a
-- duration choice does not: when it goes on sale, how many one buyer may take,
-- whether it is listed, and where its holder sits.
--
-- THE ONE THING THAT IS NOT OBVIOUS, AND IS THE POINT OF THIS FILE.
--
-- `20261229000210:47` already gave this table a `capacity_pool_id`, which
-- invites the conclusion "a tier is a variant, so point the variant at its pool
-- and you are done". That is right for a boxed product and WRONG for an event.
--
-- A variant is ONE ROW. An event with a twelve-Sunday series has TWELVE POOLS
-- PER TIER -- one per occurrence -- and one uuid column holds one uuid. So for
-- an event tier `capacity_pool_id` stays NULL and the pool is RESOLVED, never
-- stored: (subject_kind='session_tier', subject_id=session.id, pool_key=slug).
-- A non-null value there would be a second, stale source of truth for a fact
-- that is per-session, and it would look authoritative.
--
-- WHICH IS WHY `pool_key` EXISTS AND WHY IT IS NOT THE LABEL. The pool is found
-- by key, so the key must survive the thing a venue does constantly: renaming
-- the tier. "GA" becomes "General admission" on a Tuesday afternoon, and if the
-- key were derived from the label, every pool for every future session orphans
-- at once and the 88 seats already sold detach from the tier that sold them.
-- The label is for humans and changes freely; the key is an identifier and is
-- assigned once. That is the whole reason this is a column rather than a
-- function of another column.

BEGIN;

ALTER TABLE public.talent_offering_variants
  -- Immutable per offering, assigned at creation, never recomputed from `label`.
  ADD COLUMN IF NOT EXISTS pool_key      text,
  ADD COLUMN IF NOT EXISTS sales_from    timestamptz,
  ADD COLUMN IF NOT EXISTS sales_until   timestamptz,
  ADD COLUMN IF NOT EXISTS min_per_order int NOT NULL DEFAULT 1 CHECK (min_per_order >= 1),
  ADD COLUMN IF NOT EXISTS max_per_order int CHECK (max_per_order IS NULL OR max_per_order >= 1),
  -- Sold by link only: the guest list and comps live here rather than in a
  -- separate object, because a comp is a hidden tier at zero.
  ADD COLUMN IF NOT EXISTS is_hidden     boolean NOT NULL DEFAULT false,
  -- NULL inherits the event's gate, which itself inherits the workspace's. An
  -- absent value is not a value, three levels deep.
  ADD COLUMN IF NOT EXISTS age_gate      int CHECK (age_gate IS NULL OR age_gate BETWEEN 1 AND 99),
  ADD COLUMN IF NOT EXISTS description   text,
  -- 'seat_map' is DELIBERATELY ABSENT from this CHECK. Seat maps are Spaces S5,
  -- which is wave E -- behind Events, not in front of it. A value that cannot
  -- be honoured is a promise the schema makes and the engine refuses; S5 adds
  -- it to the CHECK when it can serve it.
  ADD COLUMN IF NOT EXISTS seating_mode  text
    CHECK (seating_mode IS NULL OR seating_mode IN ('standing','space_group')),
  ADD COLUMN IF NOT EXISTS space_group_id uuid
    REFERENCES public.space_groups(id) ON DELETE SET NULL;

-- Unique PER OFFERING, not globally: two events may both have a "ga".
CREATE UNIQUE INDEX IF NOT EXISTS offering_variants_pool_key_uniq
  ON public.talent_offering_variants (offering_id, pool_key)
  WHERE pool_key IS NOT NULL;

ALTER TABLE public.talent_offering_variants
  DROP CONSTRAINT IF EXISTS variant_sales_window,
  DROP CONSTRAINT IF EXISTS variant_order_bounds,
  DROP CONSTRAINT IF EXISTS variant_group_needs_mode;

ALTER TABLE public.talent_offering_variants
  ADD CONSTRAINT variant_sales_window
    CHECK (sales_until IS NULL OR sales_from IS NULL OR sales_until > sales_from),
  ADD CONSTRAINT variant_order_bounds
    CHECK (max_per_order IS NULL OR max_per_order >= min_per_order),
  -- A group without the mode is a tier that thinks it is seated and sells as
  -- standing. Cheap to state, silent if omitted.
  ADD CONSTRAINT variant_group_needs_mode
    CHECK (space_group_id IS NULL OR seating_mode = 'space_group');

COMMENT ON COLUMN public.talent_offering_variants.pool_key IS
  'Stable identifier for this tier within its offering, used as capacity_pools.pool_key. Assigned '
  'once at creation and NEVER recomputed from `label`: renaming "GA" to "General admission" must not '
  'orphan the pools of every future session and detach the seats already sold. NULL on variants that '
  'are not event tiers.';
COMMENT ON COLUMN public.talent_offering_variants.capacity_pool_id IS
  'Stock pool for a TIME-INDEPENDENT variant. Must stay NULL for an event tier: an event with a '
  'twelve-session series has twelve pools per tier and this column holds one, so the pool is resolved '
  'per session as (session_tier, session.id, pool_key). A value here would be a stale second truth.';
COMMENT ON COLUMN public.talent_offering_variants.is_hidden IS
  'Not listed on the public page; reachable by link. This is what a guest list and comps are: a hidden '
  'tier priced at zero, rather than a separate object with its own rules.';

COMMIT;
