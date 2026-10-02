-- Which Stripe PLATFORM account (us | mx) took the charge for a booking
-- transaction. Additive; default 'us' = every existing row. Code tolerates the
-- column being absent (reads default to 'us'; only MX charges write it).
ALTER TABLE public.booking_transactions
  ADD COLUMN IF NOT EXISTS stripe_platform text NOT NULL DEFAULT 'us'
    CHECK (stripe_platform IN ('us','mx'));

COMMENT ON COLUMN public.booking_transactions.stripe_platform IS
  'Stripe platform account that took the charge. Payouts/refunds/disputes must run on this platform.';
