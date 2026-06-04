-- Guest-chat multi-email claim — "use a different/additional email", first-confirm-wins.
--
-- ┌─ WHAT THIS ADDS ────────────────────────────────────────────────────────────┐
-- │ A guest who started a conversation from a talent profile is provisioned an    │
-- │ onboarding client account for the email they typed (ensureGuestClientByEmail).│
-- │ They may want the sign-in link sent to a DIFFERENT or ADDITIONAL email         │
-- │ (typed wrong, prefers another inbox, shares with a colleague). Each such email │
-- │ is provisioned into its own (onboarding) account and REGISTERED as a claim     │
-- │ CANDIDATE on the inquiry via this array. Whichever candidate confirms their    │
-- │ magic-link FIRST claims the conversation (relink in /auth/confirm).            │
-- └──────────────────────────────────────────────────────────────────────────────┘
--
-- SECURITY: a candidate is only ever added by the cookie-owning guest (the action
-- re-checks inquiries.guest_session_id === cookie session before appending). The
-- relink in /auth/confirm only fires for a candidate whose magic-link was actually
-- confirmed (proves inbox control) AND only while the current owner account is
-- still account_status='onboarding' (unclaimed) — so once the first candidate
-- confirms and becomes active, later confirms match nothing. First-confirm-wins.

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS claim_candidate_user_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.inquiries.claim_candidate_user_ids IS
  'Candidate client account ids eligible to claim this inquiry via email confirm. '
  'Seeded with the first provisioned account at creation; the guest can add more '
  '(different/additional emails). First candidate to confirm their magic-link '
  'wins the relink (see app/auth/confirm/route.ts).';

-- GIN index so the confirm-route lookup (user.id = ANY(claim_candidate_user_ids))
-- can be served by an index rather than a full scan as inquiry volume grows.
CREATE INDEX IF NOT EXISTS inquiries_claim_candidate_user_ids_gin
  ON public.inquiries USING gin (claim_candidate_user_ids);

COMMIT;
