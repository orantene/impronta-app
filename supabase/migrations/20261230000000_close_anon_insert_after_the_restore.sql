-- Re-close anon INSERT on the three telemetry tables, ORDERED AFTER the
-- migration that restores it. IT Integration and Security Director, 2026-09-06.
--
-- WHY THIS FILE EXISTS AND WHY ITS TIMESTAMP IS NOT `date -u +%Y%m%d%H%M%S`.
--
-- `20260906145432_close_anon_insert_on_telemetry_tables.sql` closed the hole and
-- is applied to production. But the tree already contains future-dated
-- migrations, and one of them is
-- `20261229000701_restore_anon_insert_on_the_three_guest_write_tables.sql`,
-- which does exactly what its name says:
--   GRANT INSERT ON public.{guest_sessions,search_queries,analytics_events} TO anon;
--
-- On production both are recorded, neither re-runs, and the end state is correct
-- because mine applied later in wall-clock time. On ANY FRESH DATABASE -- a local
-- reset, a Supabase branch, a disaster restore -- migrations replay in VERSION
-- order, and 20261229000701 sorts AFTER 20260906145432. The rebuilt database
-- would therefore re-grant anon INSERT and the hole would be back, silently,
-- with every migration green. A fix that does not survive a rebuild is not a fix.
--
-- Real UTC now is 2026-09-06, so the conventional timestamp would sort in the
-- wrong place. This file is deliberately numbered above the tree's current
-- maximum (20261229014659) so that it is last. That is the whole point of it.
--
-- WHY THE RESTORE WAS WRITTEN, AND WHY IT NO LONGER APPLIES. It followed a
-- schema-wide revoke (#1654) and argued that removing these grants would break
-- guest sessions, search logging and analytics silently. That was a real risk
-- for the code as it stood. It is not the code that ships today, and this is
-- measured, not argued:
--   * analytics_events: after the revoke, a real POST to the production route
--     https://app.tulala.digital/api/analytics/events returned 200 {"ok":true}
--     and wrote row 1e767ad5-e268-4944-97e5-b481a03d0198 at 15:00:48Z. The route
--     writes via logAnalyticsEventServer -> createServiceRoleClient().
--   * guest_sessions: two rows written after the revoke (newest 14:57:24Z); the
--     path is ensure_guest_session(), SECURITY DEFINER, which runs as owner.
--   * search_queries: same service-role writer (log-search-query.ts). Dormant in
--     production, so this one is inferred from the shared pattern, not separately
--     observed. Stated plainly rather than claimed as proven.
-- The service role bypasses RLS and needs no anon grant, so nothing legitimate
-- depends on these three grants any more.

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
    if not has_table_privilege('service_role', format('public.%I', t), 'INSERT') then
      bad := bad || ' ' || t || ':service_role_lost';
    end if;
    if exists (
      select 1 from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and pol.polcmd = 'a'
        and (pol.polroles = '{0}' or 'anon'::regrole::oid = any(pol.polroles))
    ) then
      bad := bad || ' ' || t || ':insert_policy_remains';
    end if;
  end loop;
  if bad <> '' then
    raise exception 'post-restore anon-insert closure assertion failed:%', bad;
  end if;
end $$;
