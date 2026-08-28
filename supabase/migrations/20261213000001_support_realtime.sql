-- support_realtime
-- ────────────────
-- Add support_tickets + support_messages to the supabase_realtime publication
-- so the in-app panel's postgres_changes subscriptions actually receive
-- INSERT/UPDATE events. Copy of 20260523184533_inquiry_messages_realtime.sql.
--
-- Idempotent: ALTER PUBLICATION ADD throws if the table is already in the
-- publication, so the DO/EXCEPTION wrapper swallows duplicate_object.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;
