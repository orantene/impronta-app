-- STANDING v2 P2 — review_requests anti-spam + token expiry.
--
-- The faceone invite path (talent invites a past client to review) only dedupes
-- by (booking_id, client_user_id); the email-invite path (invited_email, no
-- account) could be spammed. Add a per-(booking, email) unique guard + a token
-- expiry so /review/[token] can reject stale/expired links. Idempotent.

BEGIN;

ALTER TABLE public.review_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days');

COMMENT ON COLUMN public.review_requests.expires_at IS
  'Token expiry for /review/[token]. Past this, the landing page rejects the link (status may be set to expired by a sweep).';

-- Dedupe invites by (booking, email) so a talent cannot spam the same client email.
CREATE UNIQUE INDEX IF NOT EXISTS review_requests_booking_email_unique
  ON public.review_requests (booking_id, lower(invited_email))
  WHERE booking_id IS NOT NULL AND invited_email IS NOT NULL;

COMMIT;
