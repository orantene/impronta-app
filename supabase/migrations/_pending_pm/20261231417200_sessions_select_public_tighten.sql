-- 20261231417200_sessions_select_public_tighten.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PROPOSAL for the Production Migration Manager (TUL-1269 #12, package H2).
--
-- WHY: sessions_select_public is `status = 'scheduled'` and nothing else, so
-- anon can read every scheduled occurrence of every tenant, including sessions
-- whose offering is a draft, hidden or unapproved, and sessions of an event
-- that is still a draft. The comment on the table says "a published session
-- is public information"; the policy did not check "published".
--
-- WHAT: a session is public only when it is scheduled AND
--   - it has no offering, or its offering is published, public/on_request and
--     approved (the same predicate as talent_offerings_public_read), AND
--   - it has no event, or its event is published.
-- Staff keep sessions_select_staff. Writes stay service-role only.
--
-- ORDER: safe to apply before or after the code (additive tightening; the
-- public reader goes through the service role or capacity_remaining_public).
--
-- DRY RUN (read-only): rows that would stop being public
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
