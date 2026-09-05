-- Phase 2 · E8b — door money is PAIRED: amount and method both present or
-- both absent, so an unpriced row can never hide inside a total.
--
-- `…378` allowed a door sale to carry an amount with no method, or a method
-- with no amount. The Director's objection is right: on a door sale every
-- real state already has a value (a comp is 0), so NULL can only mean
-- "nobody filled it in" — and SUM() treats that exactly like a comp, giving
-- an operator a total that looks complete and is short.
--
-- The obvious fix — "no order line ⇒ amount NOT NULL" — breaks a row that is
-- NOT a door sale: Reservations' restaurant walk-in is an admission with no
-- order line, anchored on a space, with no money at all. The schema's anchor
-- rule enumerates it on purpose. So the rule is on the PAIR, not the anchor:
--
--   door_amount_cents IS NULL  <=>  door_paid_via IS NULL
--
-- The door-sale action always sets both. The night report sums only rows
-- with a method and shows rows without one as their own countable line,
-- "walk-ups without a recorded amount", never inside the takings. Absence is
-- structurally distinct from a value, which is the property that matters.

BEGIN;

ALTER TABLE public.admissions
  DROP CONSTRAINT IF EXISTS admissions_door_money_paired;
ALTER TABLE public.admissions
  ADD CONSTRAINT admissions_door_money_paired
  CHECK ((door_amount_cents IS NULL) = (door_paid_via IS NULL));

COMMIT;
