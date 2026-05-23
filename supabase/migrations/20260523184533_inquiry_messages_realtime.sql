-- inquiry_messages_realtime
-- ─────────────────────────
-- Add inquiry_messages to the supabase_realtime publication so client-side
-- subscriptions actually receive INSERT/UPDATE/DELETE events.
--
-- Symptom that triggered this: client + admin + talent Messages surfaces all
-- have realtime subscriptions wired (ClientMessagesShell channel filter +
-- useInquiryRealtime hook on admin shell), but new messages from the
-- counterparty don't surface until a page reload — the channels were
-- connecting fine, the table just wasn't being published.
--
-- Idempotent: ALTER PUBLICATION ADD throws if the table is already in the
-- publication, so the DO/EXCEPTION wrapper swallows duplicate_object.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.inquiry_messages;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

-- Realtime needs the full row for the OLD record on UPDATE/DELETE so client
-- filters (e.g. by thread_type) can compare against the prior state. Without
-- REPLICA IDENTITY FULL only the primary key column is sent.
ALTER TABLE public.inquiry_messages REPLICA IDENTITY FULL;
