-- Backfill: replace secret capability-URL segments already stored in
-- analytics_events with the placeholder the app now writes (PR #3709).
-- Touches only analytics_events.path and payload url/path/page.
-- Idempotent: the WHERE excludes segments already starting with ':'.
-- Routes: /invite/:token /visit/:token /api/calendar/feed/:token /ticket/:code /r/:code
-- (optional 2-letter locale prefix, optional scheme+host on payload values).

create or replace function pg_temp.redact_secret_path(v text) returns text
language sql immutable as $$
  select regexp_replace(
    regexp_replace(
      v,
      '^((?:https?://[^/?#]*)?(?:/[A-Za-z]{2})?/(?:api/calendar/feed|invite|visit))/[^/?#:][^/?#]*',
      '\1/:token'
    ),
    '^((?:https?://[^/?#]*)?(?:/[A-Za-z]{2})?/(?:ticket|r))/[^/?#:][^/?#]*',
    '\1/:code'
  )
$$;

update public.analytics_events
set path = pg_temp.redact_secret_path(path)
where path ~ '^(https?://[^/?#]*)?(/[A-Za-z]{2})?/(api/calendar/feed|invite|visit|ticket|r)/[^/?#:]';

update public.analytics_events
set payload = payload
  || case when payload->>'url' ~ '^(https?://[^/?#]*)?(/[A-Za-z]{2})?/(api/calendar/feed|invite|visit|ticket|r)/[^/?#:]'
       then jsonb_build_object('url', pg_temp.redact_secret_path(payload->>'url')) else '{}'::jsonb end
  || case when payload->>'path' ~ '^(https?://[^/?#]*)?(/[A-Za-z]{2})?/(api/calendar/feed|invite|visit|ticket|r)/[^/?#:]'
       then jsonb_build_object('path', pg_temp.redact_secret_path(payload->>'path')) else '{}'::jsonb end
  || case when payload->>'page' ~ '^(https?://[^/?#]*)?(/[A-Za-z]{2})?/(api/calendar/feed|invite|visit|ticket|r)/[^/?#:]'
       then jsonb_build_object('page', pg_temp.redact_secret_path(payload->>'page')) else '{}'::jsonb end
where jsonb_typeof(payload) = 'object'
  and (   payload->>'url'  ~ '^(https?://[^/?#]*)?(/[A-Za-z]{2})?/(api/calendar/feed|invite|visit|ticket|r)/[^/?#:]'
       or payload->>'path' ~ '^(https?://[^/?#]*)?(/[A-Za-z]{2})?/(api/calendar/feed|invite|visit|ticket|r)/[^/?#:]'
       or payload->>'page' ~ '^(https?://[^/?#]*)?(/[A-Za-z]{2})?/(api/calendar/feed|invite|visit|ticket|r)/[^/?#:]');
