-- Phase 2 · E9 — the lineup. One nullable column on the busiest table here.
--
-- This is the marketplace hinge, and it is one column. A venue that creates an
-- event books its DJ through the EXISTING inquiry spine -- the venue is the
-- client, the performer is the talent, the money is a talent-lane order -- and
-- sells tickets to the public through orders, where the venue is the seller.
-- Both sides of the marketplace on one object, and no competitor sits on both.
--
-- TWO MONEY FLOWS, TWO ORDERS, NEVER NETTED. Tickets in and the performer's fee
-- out are separate orders with separate commission snapshots. The LineupTab
-- says it in the product's own words: "ticket money and performer fees never
-- mix." Netting them would make the venue's payout depend on ticket sales,
-- which is not what anyone signed.
--
-- WHY A COLUMN AND NOT A JOIN TABLE. Can two events legitimately share one
-- inquiry? No: an inquiry is one conversation about one engagement. One-to-many,
-- so the link belongs on the many side. A join table would permit exactly the
-- thing this protects against -- one booking claimed by two shows -- which is
-- the same reasoning that put `event_id` on `sessions` rather than between them.

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

-- ON DELETE SET NULL, not CASCADE: deleting an event must never destroy the
-- conversation with a performer, which may carry an accepted offer, a signed
-- rate and a payment. The event is the context of the booking, not its owner.
-- (And an event with admissions cannot be deleted at all -- 20261229000362.)

CREATE INDEX IF NOT EXISTS inquiries_event_idx
  ON public.inquiries (event_id) WHERE event_id IS NOT NULL;

COMMENT ON COLUMN public.inquiries.event_id IS
  'The event this booking is FOR, when a venue is hiring a performer for one of its own shows. The '
  'venue is the client on this inquiry and the seller on the ticket orders; the two money flows are '
  'separate orders with separate snapshots and are never netted. NULL for every ordinary inquiry.';

COMMIT;
