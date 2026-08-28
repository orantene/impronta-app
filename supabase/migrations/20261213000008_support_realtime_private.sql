-- Support Center M6 hardening — private live co-browse channels.
--
-- The live rrweb stream broadcasts on `support.replay.{sessionId}`. Without
-- authorization, ANY client holding the anon key and the session UUID could
-- subscribe to the raw screen stream (and inject pointer/draw guidance). The
-- clients now open these channels with `private: true`, which makes Supabase
-- Realtime authorize joins against RLS on `realtime.messages`. These policies
-- restrict the topic prefix to the recorded user and platform admins.
--
-- Scoped strictly to topics LIKE 'support.replay.%' — existing public
-- channels (presence, inquiry chat) are untouched.
--
-- Rollback: DROP POLICY support_replay_broadcast_read / _write ON realtime.messages;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    RAISE NOTICE 'realtime.messages missing — skipping private-channel policies';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS support_replay_broadcast_read ON realtime.messages';
  EXECUTE $pol$
    CREATE POLICY support_replay_broadcast_read ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.topic() LIKE 'support.replay.%'
        AND (
          public.is_platform_admin()
          OR EXISTS (
            SELECT 1 FROM public.support_replay_sessions s
            WHERE ('support.replay.' || s.id::text) = realtime.topic()
              AND s.user_id = (SELECT auth.uid())
          )
        )
      )
  $pol$;

  EXECUTE 'DROP POLICY IF EXISTS support_replay_broadcast_write ON realtime.messages';
  EXECUTE $pol$
    CREATE POLICY support_replay_broadcast_write ON realtime.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        realtime.topic() LIKE 'support.replay.%'
        AND (
          public.is_platform_admin()
          OR EXISTS (
            SELECT 1 FROM public.support_replay_sessions s
            WHERE ('support.replay.' || s.id::text) = realtime.topic()
              AND s.user_id = (SELECT auth.uid())
          )
        )
      )
  $pol$;
END
$$;
