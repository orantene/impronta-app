-- Payout accounts: a masked bank reference and who verified a manual account.
--
-- A manual_bank account now starts as 'pending_verification'. It becomes 'connected' either
-- automatically (a Stripe Connect account with payouts enabled) or when the workspace OWNER marks
-- it verified, which needs a bank reference on file. We store a REFERENCE only (holder, bank
-- name, last 4 digits), never a full account number: money moves off platform for these accounts.
--
-- Additive and idempotent. Existing rows and policies are untouched (staff-only policies stay;
-- the app writes these columns on the service role after its own owner check).

ALTER TABLE public.payout_accounts
  ADD COLUMN IF NOT EXISTS bank_holder_name        text,
  ADD COLUMN IF NOT EXISTS bank_name               text,
  ADD COLUMN IF NOT EXISTS bank_last4              text,
  ADD COLUMN IF NOT EXISTS bank_details_added_at   timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payout_accounts_bank_last4_format'
  ) THEN
    ALTER TABLE public.payout_accounts
      ADD CONSTRAINT payout_accounts_bank_last4_format
      CHECK (bank_last4 IS NULL OR bank_last4 ~ '^[0-9]{4}$');
  END IF;
END $$;

COMMENT ON COLUMN public.payout_accounts.bank_last4 IS
  'Last 4 digits of the bank account, reference only. Never store a full account number here.';
COMMENT ON COLUMN public.payout_accounts.verified_by_profile_id IS
  'The workspace owner who marked a manual account verified (null for Stripe-verified accounts).';
