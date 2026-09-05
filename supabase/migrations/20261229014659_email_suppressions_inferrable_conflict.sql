-- Bounce suppression could never write for a guest. Probed, not inferred.
--
-- `applyResendEvent` (lib/notifications/resend-webhook.ts) picks its conflict
-- target at RUNTIME:
--
--   onConflict: userId ? "user_id,email_address" : "email_address"
--
-- Both branches probed against production through the same client the app uses,
-- with an impossible key so nothing could be written:
--
--   on conflict (user_id, email_address)  -> 23503  plans, then the FK objects
--   on conflict (email_address)           -> 42P10  never planned, ever
--
-- The guest branch matched `email_suppressions_guest_uq`, which is BOTH an
-- expression index and a partial one:
--
--   CREATE UNIQUE INDEX ... ON email_suppressions (lower(email_address))
--     WHERE (user_id IS NULL)
--
-- Postgres cannot infer an expression index from a bare column name, and will
-- not infer a partial index without its predicate, which PostgREST never sends.
--
-- THIS IS THE THIRD CORRECTION ON THIS PATH AND THE SECOND OF MINE. First the
-- table required a user_id, so guest bounces were dropped; I removed that and
-- reported suppression fixed. It was not: this branch could not plan. Every
-- "fix" that is not probed against the real client is a guess with a changelog
-- entry.
--
-- THE FIX: make the uniqueness expressible as plain columns, so ON CONFLICT can
-- infer it and the runtime-computed target can collapse into one shape.
--
--   user_key   coalesce(user_id, all-zero uuid) -- guests share one key
--   email_key  lower(email_address)             -- case is not identity
--
-- Both STORED and GENERATED, so they cannot drift from the columns they mirror.
-- The unique index on (user_key, email_key) is total and non-expression, which
-- is exactly what ON CONFLICT can infer. It also states the intended rule more
-- honestly than the pair of indexes it replaces: one suppression per address per
-- person, with all guests counting as the same person, case-insensitively.

alter table public.email_suppressions
  add column if not exists user_key uuid
    generated always as (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  add column if not exists email_key text
    generated always as (lower(email_address)) stored;

-- Collapse any rows the old case-sensitive index allowed to duplicate, keeping
-- the earliest, so the new unique index can be created.
delete from public.email_suppressions a
  using public.email_suppressions b
 where a.ctid > b.ctid
   and coalesce(a.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
     = coalesce(b.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
   and lower(a.email_address) = lower(b.email_address);

drop index if exists public.email_suppressions_guest_uq;
-- email_suppressions_uq is backed by a CONSTRAINT, not a bare index, so
-- DROP INDEX refuses it with 2BP01. The constraint goes, and its replacement is
-- a plain unique index: ON CONFLICT infers either, and an index is the lighter
-- of the two to redefine later.
alter table public.email_suppressions drop constraint if exists email_suppressions_uq;
drop index if exists public.email_suppressions_uq;

create unique index email_suppressions_uq
  on public.email_suppressions (user_key, email_key);

-- The migration proves its own claim. The statement the application will now
-- run, with an impossible user, must get PAST planning: 23503 means the index
-- was inferred and only the foreign key objected. 42P10 means this migration
-- has not achieved anything and must not report success.
do $$
begin
  begin
    insert into public.email_suppressions (user_id, email_address, reason)
    values ('00000000-0000-0000-0000-0000000000fe'::uuid, 'probe@invalid.test', 'hard_bounce')
    on conflict (user_key, email_key) do nothing;
    raise exception 'probe wrote a row for a user that does not exist; the FK is missing';
  exception
    when foreign_key_violation then
      null;  -- 23503: inference worked.
    when invalid_column_reference then
      raise exception 'ON CONFLICT still cannot infer email_suppressions_uq (42P10)';
  end;

  -- And the guest branch, which is the one that never worked. No user id, so no
  -- foreign key to object: this one must SUCCEED, then be removed.
  insert into public.email_suppressions (user_id, email_address, reason)
  values (null, 'probe-guest@invalid.test', 'hard_bounce')
  on conflict (user_key, email_key) do nothing;

  if not exists (
    select 1 from public.email_suppressions where email_address = 'probe-guest@invalid.test'
  ) then
    raise exception 'guest suppression still wrote nothing';
  end if;

  -- Re-running must be a no-op rather than a duplicate or an error.
  insert into public.email_suppressions (user_id, email_address, reason)
  values (null, 'PROBE-GUEST@invalid.test', 'hard_bounce')
  on conflict (user_key, email_key) do nothing;

  if (select count(*) from public.email_suppressions
        where lower(email_address) = 'probe-guest@invalid.test') <> 1 then
    raise exception 'case-insensitive dedupe failed; the same address suppressed twice';
  end if;

  delete from public.email_suppressions where lower(email_address) = 'probe-guest@invalid.test';
end $$;
