-- Close unbounded anonymous INSERT on analytics_events, search_queries and
-- guest_sessions.
-- IT Integration and Security Director, 2026-09-06.
--
-- PROVEN BEFORE THE FIX, against production PostgREST with the public anon key
-- (the key that ships in every browser bundle):
--   POST /rest/v1/analytics_events with an impossible tenant_id
--   -> HTTP 409, SQLSTATE 23503, "Key is not present in table agencies"
-- A foreign-key violation is a POST-PLANNING refusal: RLS permitted the insert
-- and only the FK stopped it. Zero rows written. Had RLS refused, the answer
-- would have been 42501. Worse, analytics_events.tenant_id DEFAULTS to the
-- sentinel 00000000-0000-0000-0000-000000000001, which exists in `agencies`, so
-- omitting the column produces a valid row: no tenant id needed to abuse it.
-- search_queries.tenant_id is nullable, so it is easier still.
--
-- Each table carried an INSERT policy for {anon,authenticated} with
-- WITH CHECK (true) -- unconditional. The app's Upstash rate limiter guards the
-- route handlers and is bypassed entirely by talking to PostgREST directly.
-- Impact was cost and integrity, not disclosure: every SELECT policy on these
-- three is staff-gated (is_staff_of_tenant / is_agency_staff), so anon reads
-- nothing, and guest session keys in particular stay unreadable -- which is what
-- keeps the four anon-executable guest RPCs sound, since they are keyed on a
-- crypto.randomUUID() session key alone.
--
-- CALLERS READ BEFORE THE REVOKE (the rule this repo pays for repeatedly):
--   analytics_events  <- lib/analytics/server-log.ts, createServiceRoleClient()
--   search_queries    <- lib/search-queries/log-search-query.ts, service role
--   guest_sessions    <- ensure_guest_session(), SECURITY DEFINER, plus service
--                        role reads in lib/guest/guest-session.ts
-- The service role bypasses RLS, and SECURITY DEFINER runs as the owner, so no
-- legitimate write depends on these policies or on the anon/authenticated
-- INSERT grants. No client component and no importer of lib/supabase/client
-- touches any of the three tables.
--
-- Dropping the policy is what closes the hole (RLS denies without a permissive
-- policy). The grant revoke is defence in depth, and it revokes FROM PUBLIC
-- first because a grant held through PUBLIC makes REVOKE FROM anon a no-op.

drop policy if exists analytics_events_insert_public on public.analytics_events;
drop policy if exists search_queries_insert_public   on public.search_queries;
drop policy if exists guest_sessions_insert_anon     on public.guest_sessions;

revoke insert on table public.analytics_events from public, anon, authenticated;
revoke insert on table public.search_queries   from public, anon, authenticated;
revoke insert on table public.guest_sessions   from public, anon, authenticated;

grant insert on table public.analytics_events to service_role;
grant insert on table public.search_queries   to service_role;
grant insert on table public.guest_sessions   to service_role;

do $$
declare
  bad text := '';
  t text;
begin
  foreach t in array array['analytics_events','search_queries','guest_sessions'] loop
    if has_table_privilege('anon', format('public.%I', t), 'INSERT') then
      bad := bad || ' ' || t || ':anon_insert';
    end if;
    if has_table_privilege('authenticated', format('public.%I', t), 'INSERT') then
      bad := bad || ' ' || t || ':authenticated_insert';
    end if;
    if not has_table_privilege('service_role', format('public.%I', t), 'INSERT') then
      bad := bad || ' ' || t || ':service_role_lost';
    end if;
    -- No permissive INSERT policy may remain that anon can satisfy.
    if exists (
      select 1 from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t
        and pol.polcmd = 'a'
        and (pol.polroles = '{0}' or 'anon'::regrole::oid = any(pol.polroles))
    ) then
      bad := bad || ' ' || t || ':insert_policy_remains';
    end if;
    -- The staff read path must survive untouched.
    if not has_table_privilege('service_role', format('public.%I', t), 'SELECT') then
      bad := bad || ' ' || t || ':service_role_select_lost';
    end if;
  end loop;

  if bad <> '' then
    raise exception 'anon-insert closure assertion failed:%', bad;
  end if;
end $$;
