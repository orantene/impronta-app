-- Reservations R4 — which offering a table booking hangs its order line on.
--
-- WHY A RESERVATION NEEDS AN OFFERING AT ALL
-- Every order line points at a `talent_offerings` row, because that row is
-- where the PAYMENT POLICY lives: reserve mode, deposit percentage, whether
-- pay-in-person is allowed, whether an account is required, cancellation hours.
-- The purchase pipeline re-derives all of it server-side from that row and
-- ignores anything the client claims. A reservation with no offering would be
-- an order the pipeline cannot price or gate, so it would need a second,
-- parallel policy path — which is exactly the thing the pipeline exists to
-- delete.
--
-- So a venue taking reservations points at ONE offering, "Dinner for N" in the
-- mockup's words, and that offering carries the deposit rule. Party size is not
-- a quantity of it: the line is always ONE unit, because a party of four takes
-- one table. Covers live on the admission.
--
-- WHY NULLABLE, AND WHY NO DEFAULT
-- A venue can have rules and windows before it has an offering, and it should:
-- the settings page is usable, the book renders, and only the BOOKING refuses,
-- with a reason a reader can act on. A NOT NULL here would make a venue
-- unconfigurable until a catalog row existed, which inverts the order an
-- operator actually works in.
--
-- ON DELETE SET NULL rather than CASCADE: deleting an offering must not delete
-- a venue's entire reservation configuration. It makes bookings refuse, which
-- is visible, rather than silently erasing turn times and deposit policy.
--
-- Rollback: drop the column. Nothing else references it.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

ALTER TABLE public.venue_service_rules
  ADD COLUMN IF NOT EXISTS reservation_offering_id UUID
    REFERENCES public.talent_offerings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.venue_service_rules.reservation_offering_id IS
  'The offering a table booking''s order line points at, and therefore where its deposit and cancellation policy live. NULL = this venue cannot take a booking yet, which is a refusal with a reason and not a broken state. A line is always ONE unit whatever the party size; covers live on admissions.party_size.';

CREATE INDEX IF NOT EXISTS venue_service_rules_offering_idx
  ON public.venue_service_rules (reservation_offering_id)
  WHERE reservation_offering_id IS NOT NULL;

COMMIT;
