-- M1 — Guest-in-thread messaging (Lane A, conversational-inquiry MVP).
--
-- Adds a nullable guest_session_id to inquiry_messages so a guest (an
-- unauthenticated visitor identified ONLY by the x-impronta-guest cookie →
-- guest_sessions row) can author a message in the inquiry thread they own.
--
-- A guest-authored message row is therefore:
--     { sender_user_id: NULL, guest_session_id: <uuid> }
-- and an authenticated message row is unchanged:
--     { sender_user_id: <uuid>, guest_session_id: NULL }.
--
-- sender_user_id is ALREADY nullable today (system messages use NULL), and the
-- existing FK is ON DELETE SET NULL — so there is no authorship CHECK constraint
-- to amend. Mirrors the same column already on inquiries.guest_session_id
-- (FK guest_sessions ON DELETE SET NULL), so the relationship is consistent
-- across the inquiry + its messages.
--
-- Security note: the column is set ONLY by the service-role guest-message write
-- path (sendGuestMessageAction → engine guest-sender branch), which proves
-- ownership via inquiries.guest_session_id == lookup(x-impronta-guest) BEFORE
-- the insert. RLS on inquiry_messages stays auth.uid()-based; guests never
-- write under RLS.

BEGIN;

ALTER TABLE public.inquiry_messages
  ADD COLUMN IF NOT EXISTS guest_session_id UUID
    REFERENCES public.guest_sessions(id) ON DELETE SET NULL;

-- Partial index: the only guest read pattern is "messages this guest authored
-- in this thread", and the only filter is guest_session_id IS NOT NULL.
CREATE INDEX IF NOT EXISTS inquiry_messages_guest_session_idx
  ON public.inquiry_messages (guest_session_id)
  WHERE guest_session_id IS NOT NULL;

COMMENT ON COLUMN public.inquiry_messages.guest_session_id IS
  'Guest author (conversational-inquiry MVP). Set ONLY for guest-sent rows '
  '(sender_user_id NULL). Written by the service-role guest-message path after '
  'an inquiries.guest_session_id ownership check. NULL for authed + system rows.';

COMMIT;
