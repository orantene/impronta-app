-- MONEY BUG 4: a booking cancel computed the refund the policy owes
-- (`refundableCents`) and told the guest "a refund opens", but wrote nothing.
-- `booking_refund_intents` is that record: ONE row per cancelled booking, the
-- amount the cancel policy says is owed, written by `cancelBookingSet`.
--
-- NOT `ticket_refund_intents`: that table is per ORDER LINE, refunds the whole
-- line, and its executor is ticket-specific (admissions, seats). A booking's
-- owed amount can be a part of the deposit (half), which a whole-line intent
-- cannot say. This table records the OWED AMOUNT only. Nothing here moves
-- money; the refund itself stays on the existing path (Money refund by the
-- talent / desk), which reads this row for the amount.
--
-- CODE-FIRST: the writer treats a missing table (42P01) as "intent
-- unavailable", logs it and never fails the cancel, so this migration can land
-- after the code. Additive only; no existing table or function changes.
--
-- UNIQUE (booking_id) is the idempotency guard: a replayed cancel hits 23505
-- and reads "already opened".
--
-- NO anon path. Written by the service role; staff read their own tenant.

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_refund_intents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  booking_id     uuid NOT NULL REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
  order_id       uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  refund_cents   integer NOT NULL CHECK (refund_cents > 0),
  paid_cents     integer NOT NULL CHECK (paid_cents >= 0),
  currency_code  text,
  cancelled_by   text CHECK (cancelled_by IN ('talent', 'client', 'staff', 'system')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Set when a person (or a later executor) has refunded or waived it.
  resolved_at    timestamptz,
  resolved_note  text,
  CONSTRAINT booking_refund_intents_one_per_booking UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS booking_refund_intents_open_idx
  ON public.booking_refund_intents (tenant_id, created_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.booking_refund_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_refund_intents_select_staff ON public.booking_refund_intents;
CREATE POLICY booking_refund_intents_select_staff ON public.booking_refund_intents
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON TABLE public.booking_refund_intents FROM PUBLIC;
REVOKE ALL ON TABLE public.booking_refund_intents FROM anon;
GRANT SELECT ON TABLE public.booking_refund_intents TO authenticated;

COMMENT ON TABLE public.booking_refund_intents IS
  'The refund a booking cancel owes under the cancel policy (may be part of the deposit). One row per booking, written by cancelBookingSet. Records the owed amount; does not move money.';

COMMIT;
