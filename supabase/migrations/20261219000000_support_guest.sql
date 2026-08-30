-- Guest support on tulala.digital: a display name for HQ search / notification
-- hydration, and a one-balloon read watermark (a guest ticket has exactly one
-- reader — extending support_message_reads would mean PK surgery for a
-- strictly one-reader-per-ticket case).

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_last_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS support_tickets_guest_session_idx
  ON public.support_tickets (guest_session_id, last_message_at DESC)
  WHERE guest_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_tickets_contact_email_idx
  ON public.support_tickets (lower(contact_email))
  WHERE contact_email IS NOT NULL;
