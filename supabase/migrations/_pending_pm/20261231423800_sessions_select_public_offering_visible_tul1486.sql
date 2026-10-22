-- 20261231423800_sessions_select_public_offering_visible_tul1486.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- TUL-1486 (safety, Oran's GO): sessions_select_public is `status = 'scheduled'` and nothing else, so
-- ANON can read every scheduled session of every tenant, including sessions of a hidden, private,
-- draft or unapproved offering (and of a draft event).
--
-- WHAT: a session is public only when it is scheduled AND
--   - it has no offering, or its offering is published, public/on_request and approved (the SAME
--     predicate as talent_offerings_public_read, the public catalog), AND
--   - it has no event, or its event is published.
-- Staff keep sessions_select_staff. Writes stay service-role only. Idempotent (drop + create), and it
-- supersedes the same-intent held file 20261231417200_sessions_select_public_tighten.sql (apply one of
-- the two; this one is the approved version for TUL-1486).
--
-- ORDER: additive tightening, safe to apply before or after the code (the public reader goes through
-- the service role or capacity_remaining_public).
--
-- DRY RUN (read-only): rows that stop being public
--   select count(*) from public.sessions s
--    where s.status = 'scheduled'
--      and ( (s.offering_id is not null and not exists (
--               select 1 from public.talent_offerings o
--                where o.id = s.offering_id and o.status = 'published'
--                  and o.visibility in ('public','on_request')
--                  and o.moderation_state = 'approved'))
--         or (s.event_id is not null and not exists (
--               select 1 from public.events e
--                where e.id = s.event_id and e.status = 'published')));
--
-- ROLLBACK (restores the old policy):
--   DROP POLICY IF EXISTS sessions_select_public ON public.sessions;
--   CREATE POLICY sessions_select_public ON public.sessions
--     FOR SELECT TO anon, authenticated USING (status = 'scheduled');

BEGIN;

DROP POLICY IF EXISTS sessions_select_public ON public.sessions;
CREATE POLICY sessions_select_public ON public.sessions
  FOR SELECT TO anon, authenticated
  USING (
    status = 'scheduled'
    AND (
      offering_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.talent_offerings o
         WHERE o.id = sessions.offering_id
           AND o.status = 'published'
           AND o.visibility IN ('public','on_request')
           AND o.moderation_state = 'approved'
      )
    )
    AND (
      event_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.events e
         WHERE e.id = sessions.event_id
           AND e.status = 'published'
      )
    )
  );

COMMIT;
