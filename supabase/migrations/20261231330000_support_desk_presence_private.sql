-- Support Desk Phase 1c — private presence channels for agent co-viewing.
--
-- Desk (and HQ) open `support.presence.{ticketId}` with `private: true` so
-- joins authorize against RLS on realtime.messages. Platform admins only
-- (Desk agents today). Public `tulala.presence.*` broadcast is not enough
-- for journey 7 (audit D8).
--
-- Rollback: DROP POLICY support_presence_broadcast_read / _write ON realtime.messages;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'realtime.messages missing — skipping private presence policies';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS support_presence_broadcast_read ON realtime.messages';
  EXECUTE $pol$
    CREATE POLICY support_presence_broadcast_read ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.topic() LIKE 'support.presence.%'
        AND public.is_platform_admin()
      )
  $pol$;

  EXECUTE 'DROP POLICY IF EXISTS support_presence_broadcast_write ON realtime.messages';
  EXECUTE $pol$
    CREATE POLICY support_presence_broadcast_write ON realtime.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        realtime.topic() LIKE 'support.presence.%'
        AND public.is_platform_admin()
      )
  $pol$;
END
$$;
