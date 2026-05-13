-- F.5 — Booking deposit tracking on agency_bookings.
--
-- The Stripe webhook handler for `payment_intent.succeeded` with
-- metadata.purpose='booking_deposit' (see web/src/app/api/webhooks/
-- stripe/route.ts) writes the deposit_paid timestamp + amount onto
-- the agency_bookings row this PaymentIntent belongs to.
--
-- Columns:
--   deposit_paid_at           — ISO timestamp when Stripe confirmed the
--                                deposit; null until the webhook fires
--   deposit_amount_cents      — amount paid, in minor units
--   deposit_currency          — uppercase 3-letter ISO 4217
--   deposit_payment_intent_id — stripe PI id (for audit + refund lookup)
--
-- Soft column (default null) so existing bookings stay valid.

BEGIN;

ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS deposit_currency TEXT,
  ADD COLUMN IF NOT EXISTS deposit_payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agency_bookings_deposit_paid
  ON public.agency_bookings (deposit_paid_at DESC)
  WHERE deposit_paid_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_bookings_deposit_payment_intent
  ON public.agency_bookings (deposit_payment_intent_id)
  WHERE deposit_payment_intent_id IS NOT NULL;

COMMENT ON COLUMN public.agency_bookings.deposit_paid_at IS
  'F.5 — Stripe-confirmed deposit timestamp. Written by /api/webhooks/stripe on payment_intent.succeeded with metadata.purpose=booking_deposit.';

COMMIT;
