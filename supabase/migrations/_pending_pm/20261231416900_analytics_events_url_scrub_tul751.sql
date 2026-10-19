-- 20261231416900_analytics_events_url_scrub_tul751.sql
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- Production Migration Manager applies it through the audited gate, AFTER the
-- release that carries #3807 (write-side scrub) is live on production. Applied
-- earlier, the old code keeps writing full URLs and the scrub has to be re-run.
--
-- ─── WHY (TUL-751) ───────────────────────────────────────────────────────────
-- Analytics rows stored full URLs with query strings (auth codes, magic-link /
-- reset tokens, pay codes, emails). 20261231381300 backfilled ONLY
-- payload.referrer on view_site_page / view_talent_profile. #3807 (merged, not
-- in production at pointer a744cd7) scrubs on write, for EVERY event:
--   payload.referrer          -> origin only          (sanitizeReferrer)
--   payload url-like keys     -> origin + path         (stripUrlQuery)
--     url, href, location, page, page_url, page_location, link
--   path column               -> no query/fragment, secret segment redacted
--     (redactSecretPath: /invite/ /visit/ /api/calendar/feed/ -> :token,
--      /ticket/ /r/ -> :code, optional 2-letter locale prefix kept)
-- This file brings stored rows to the same shape. Nothing else is touched.
--
-- ─── DRY RUN (read-only; counts only, no values) ─────────────────────────────
--   select
--     count(*)                                                       as total,
--     count(*) filter (where payload ? 'referrer'
--       and payload->>'referrer' is distinct from
--           substring(payload->>'referrer' from '(?i)^(https?://[^/?#]+)'))    as referrer_rows,
--     count(*) filter (where exists (select 1 from jsonb_each_text(payload) kv
--       where kv.key in ('url','href','location','page','page_url','page_location','link')
--         and kv.value ~ '[?#]'))                                    as urlkey_rows,
--     count(*) filter (where path ~ '[?#]'
--       or path ~* '^(/[a-z]{2})?/(invite|visit|ticket|r|api/calendar/feed)/[^/:][^/]*') as path_rows,
--     count(*) filter (where payload::text ~* '(token|code|email|secret|password)=' or path ~* '(token|code|email)=') as secretish_rows
--   from public.analytics_events;
-- Expect (prod, 10-14): ~140 referrer rows, 1 secretish. Post the counts on TUL-751.
--
-- ─── WHAT IT DOES ────────────────────────────────────────────────────────────
-- 1. Copies the BEFORE values of every row it will change into
--    public.tul751_analytics_scrub_backup (RLS on, no policies, no grants to
--    anon/authenticated) so the change can be rolled back.
-- 2. Rewrites those rows. Idempotent: a second run changes 0 rows.
-- 3. Prints before/after counts (RAISE NOTICE).
-- The backup itself holds the leaked values: DROP it after 7 days (below).
--
-- ─── ROLLBACK (restores exactly the rows this file changed) ──────────────────
--   begin;
--   update public.analytics_events e
--      set payload = b.payload, path = b.path
--     from public.tul751_analytics_scrub_backup b
--    where b.id = e.id;
--   commit;
--
-- ─── CLEANUP (after 7 days with no rollback) ─────────────────────────────────
--   drop table public.tul751_analytics_scrub_backup;

create table if not exists public.tul751_analytics_scrub_backup (
  id uuid primary key,
  payload jsonb not null,
  path text,
  backed_up_at timestamptz not null default now()
);
alter table public.tul751_analytics_scrub_backup enable row level security;
revoke all on public.tul751_analytics_scrub_backup from anon, authenticated;

-- Pure helpers (pg_temp: gone at session end, nothing left in the schema).
create or replace function pg_temp.tul751_strip(v text) returns text
language sql immutable as $$ select split_part(split_part(v, '#', 1), '?', 1) $$;

create or replace function pg_temp.tul751_redact(p text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(p, '^((?:https?://[^/]*)?(?:/[a-zA-Z]{2})?/(?:invite|visit|api/calendar/feed)/)[^/]+', '\1:token'),
           '^((?:https?://[^/]*)?(?:/[a-zA-Z]{2})?/(?:ticket|r)/)[^/]+', '\1:code')
$$;

create or replace function pg_temp.tul751_payload(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  out jsonb := p;
  k text;
  origin text;
begin
  if out ? 'referrer' then
    origin := substring(out->>'referrer' from '(?i)^(https?://[^/?#]+)');
    out := case when origin is null then out - 'referrer'
                else jsonb_set(out, '{referrer}', to_jsonb(origin)) end;
  end if;
  foreach k in array array['url','href','location','page','page_url','page_location','link'] loop
    if jsonb_typeof(out->k) = 'string' and (out->>k) ~ '[?#]' then
      out := jsonb_set(out, array[k], to_jsonb(pg_temp.tul751_strip(out->>k)));
    end if;
  end loop;
  return out;
end $$;

do $$
declare
  n_target bigint;
  n_changed bigint;
  n_left bigint;
begin
  create temp table tul751_target on commit drop as
  select id, payload, path
    from public.analytics_events
   where payload is distinct from pg_temp.tul751_payload(payload)
      or path is distinct from pg_temp.tul751_redact(pg_temp.tul751_strip(path));
  select count(*) into n_target from tul751_target;

  insert into public.tul751_analytics_scrub_backup (id, payload, path)
  select id, payload, path from tul751_target
  on conflict (id) do nothing;  -- a re-run keeps the ORIGINAL before-values

  update public.analytics_events e
     set payload = pg_temp.tul751_payload(e.payload),
         path    = pg_temp.tul751_redact(pg_temp.tul751_strip(e.path))
    from tul751_target t
   where t.id = e.id;
  get diagnostics n_changed = row_count;

  select count(*) into n_left
    from public.analytics_events
   where payload is distinct from pg_temp.tul751_payload(payload)
      or path is distinct from pg_temp.tul751_redact(pg_temp.tul751_strip(path));

  raise notice 'TUL-751 scrub: % rows targeted, % changed, % left (expect 0)', n_target, n_changed, n_left;
  if n_left > 0 then
    raise exception 'TUL-751 scrub left % rows unscrubbed; rolling back', n_left;
  end if;
end $$;
