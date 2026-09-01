-- Guest (user-less) addresses must be suppressible after a hard bounce.
--
-- `email_suppressions.user_id` was NOT NULL, which made suppression structurally
-- impossible for any recipient without an account. applyResendEvent bails with
-- `no-user` before the insert, so a hard bounce to a guest address stamped
-- `bounced_at` and suppressed nothing — the same dead address kept being mailed.
-- Observed in production: 5 hard bounces, 0 rows in email_suppressions.
--
-- The READ side (lib/notifications/suppressions.ts) already matches on address
-- alone for guests, so only the write side needed widening.
--
-- Note on the unique index: the existing `email_suppressions_uq (user_id,
-- email_address)` cannot dedupe user-less rows, because NULLs compare as
-- distinct — Resend retries a non-2xx webhook, so a null-user upsert would
-- insert a duplicate on every retry. The partial index below gives that case a
-- real conflict target, lower()-normalised to match the case-insensitive read.

ALTER TABLE public.email_suppressions
  ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_suppressions_guest_uq
  ON public.email_suppressions (lower(email_address))
  WHERE user_id IS NULL;

COMMENT ON COLUMN public.email_suppressions.user_id IS
  'Suppressed account, or NULL for a recipient with no account (guest support, '
  'invitees). Address is the real grain; see email_suppressions_guest_uq.';
