-- Final system lock: enforce participant ordering integrity.
--
-- `sort_order` on inquiry_participants defaults to 0, which means historical
-- rows and coordinator inserts that forgot to set an explicit order can
-- collide. Collisions are a data hazard for the roster UI (dnd-kit relies on
-- stable ordering, and the talent list on the client dashboard uses
-- sort_order as the canonical display order).
--
-- This migration:
--   1) Renumbers sort_order per-inquiry for active/invited talent so the
--      existing rows are collision-free.
--   2) Adds a partial UNIQUE index enforcing one row per (inquiry_id,
--      sort_order) among active/invited talent. Declined/removed participants
--      are excluded so the index never blocks a legitimate re-invite.
--   3) Leaves the existing non-unique idx_participants_inquiry_sort index in
--      place — it still serves broader role='talent' lookups.
--
-- Idempotent: the renumber is an UPDATE-where-different, and the index is
-- IF NOT EXISTS.

BEGIN;

-- 1) Renumber any duplicate sort_order rows among active/invited talent.
--    Use (sort_order, created_at, id) as the deterministic ranking key so
--    the current intended order is preserved where possible.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY inquiry_id
           ORDER BY sort_order, created_at, id
         ) - 1 AS new_order
  FROM public.inquiry_participants
  WHERE role = 'talent'
    AND status IN ('invited', 'active')
)
UPDATE public.inquiry_participants p
SET sort_order = ranked.new_order
FROM ranked
WHERE p.id = ranked.id
  AND p.sort_order IS DISTINCT FROM ranked.new_order;

-- 2) Partial unique index: no two active/invited talent share a slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_inquiry_sort_unique
  ON public.inquiry_participants (inquiry_id, sort_order)
  WHERE role = 'talent' AND status IN ('invited', 'active');

COMMIT;
