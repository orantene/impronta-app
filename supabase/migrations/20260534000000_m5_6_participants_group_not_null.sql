-- =============================================================================
-- M5.6 — inquiry_participants.requirement_group_id NOT NULL cutover
-- =============================================================================
--
-- Finalizes the transitional window opened in M1.2. Every participant row
-- must now belong to a requirement group. The column was created nullable
-- to keep backfills idempotent; the UI surfaced orphan rows (null
-- requirement_group_id) in the M5.1 drill so staff had a window to clean
-- up before this migration lands.
--
-- Steps:
--   1. Idempotent default-group creation for any inquiry still missing one
--      (mirrors M1.2 step 1).
--   2. Idempotent assignment of any remaining null-group participant to the
--      inquiry's default group (mirrors M1.2 step 2).
--   3. A BEFORE INSERT trigger that auto-fills `requirement_group_id` from
--      the inquiry's default group when a caller omits it. This defends
--      existing insert paths (`inquiry-engine-submit.ts`, coordinator seat
--      inserts, offers.ts client-seat insert) — none of which know or care
--      about requirement groups — without forcing a simultaneous code
--      rewrite. The UI's explicit roster path (`addTalentToRoster`) keeps
--      its own resolver, so explicit ids still win.
--   4. `ALTER COLUMN ... SET NOT NULL` — fails fast if step 2 missed any
--      row (which is the desired safety net).
--
-- Rollback: drop the NOT NULL, drop the trigger. The column stays in place.
-- =============================================================================

-- 1. One default group per inquiry that's still missing one.
INSERT INTO public.inquiry_requirement_groups (inquiry_id, role_key, quantity_required, sort_order)
SELECT
  i.id,
  'talent',
  GREATEST(
    (SELECT COUNT(*) FROM public.inquiry_participants p
      WHERE p.inquiry_id = i.id AND p.role = 'talent'),
    1
  ),
  0
FROM public.inquiries i
WHERE NOT EXISTS (
  SELECT 1 FROM public.inquiry_requirement_groups g WHERE g.inquiry_id = i.id
);

-- 2. Assign any remaining null-group participant to its inquiry's default group.
UPDATE public.inquiry_participants p
SET requirement_group_id = g.id
FROM (
  SELECT DISTINCT ON (inquiry_id) id, inquiry_id
  FROM public.inquiry_requirement_groups
  ORDER BY inquiry_id, sort_order ASC, created_at ASC
) g
WHERE p.inquiry_id = g.inquiry_id
  AND p.requirement_group_id IS NULL;

-- 3. BEFORE INSERT trigger to auto-fill the column when a caller supplies NULL.
--    This is the compatibility shim that lets non-talent insert paths (client
--    seat, coordinator seat) keep their existing payload. Talent inserts via
--    the UI explicitly resolve the group in application code — that path is
--    unchanged, this trigger just fills in the blank for anyone else.
CREATE OR REPLACE FUNCTION public.inquiry_participants_default_requirement_group()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.requirement_group_id IS NULL THEN
    SELECT g.id
      INTO NEW.requirement_group_id
    FROM public.inquiry_requirement_groups g
    WHERE g.inquiry_id = NEW.inquiry_id
    ORDER BY g.sort_order ASC, g.created_at ASC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_participants_default_group
  ON public.inquiry_participants;
CREATE TRIGGER trg_inquiry_participants_default_group
  BEFORE INSERT ON public.inquiry_participants
  FOR EACH ROW EXECUTE FUNCTION public.inquiry_participants_default_requirement_group();

-- 4. Flip NOT NULL. Any stragglers not caught by step 2 will fail here —
--    that is intentional: NOT NULL is the contract M5.6 was always going to
--    enforce, and it's better to abort than silently accept a null row.
ALTER TABLE public.inquiry_participants
  ALTER COLUMN requirement_group_id SET NOT NULL;
