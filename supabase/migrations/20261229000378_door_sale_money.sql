-- Phase 2 · E8b — a door sale records the money it took, on the admission.
--
-- A walk-up sold at the door has NO order: no line, no charge, no webhook, no
-- commission snapshot. That is correct — Tulala never touches that money and
-- an order is the wrong instrument for a door queue. But "no order" must not
-- become "no fact": a venue closing a night needs to answer "how much cash
-- did we take", and the venue told us the tier price and took the money in
-- front of the door staff. So the admission carries what was ACTUALLY taken
-- (a comp is 0, a discount is a smaller number) and how, as a recorded fact.
--
-- ONLY WHEN THERE IS NO ORDER LINE. An order-backed admission's money lives
-- on its order and its transaction; letting it also carry a door amount is
-- how two money paths get netted or double-counted. The CHECK makes that
-- shape impossible rather than merely unusual.
--
-- COMMISSION IS ZERO BY CONSTRUCTION: there is no charge to snapshot. The UI
-- says "sold at the door · no platform fee" on the row so the absence reads
-- as designed, not missing.

BEGIN;

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS door_amount_cents integer
    CHECK (door_amount_cents IS NULL OR door_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS door_paid_via text
    CHECK (door_paid_via IS NULL OR door_paid_via IN ('cash', 'card_terminal', 'other'));

ALTER TABLE public.admissions
  DROP CONSTRAINT IF EXISTS admissions_door_money_only_without_order;
ALTER TABLE public.admissions
  ADD CONSTRAINT admissions_door_money_only_without_order
  CHECK (
    order_line_id IS NULL
    OR (door_amount_cents IS NULL AND door_paid_via IS NULL)
  );

COMMENT ON COLUMN public.admissions.door_amount_cents IS
  'Money actually taken at the door for this admission, in the workspace currency. NULL for order-backed admissions (their money is on the order). 0 is a comp.';
COMMENT ON COLUMN public.admissions.door_paid_via IS
  'How a door sale was paid: cash | card_terminal (the venue''s own terminal, never a Tulala charge) | other. NULL for order-backed admissions.';

COMMIT;
