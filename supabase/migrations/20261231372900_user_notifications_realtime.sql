-- TUL-631: the bell updates live. RLS on user_notifications already limits
-- SELECT to user_id = auth.uid(), so realtime delivers only a user's own rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END
$$;
