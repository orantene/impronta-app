-- Blocking has never worked. Not once, for anybody.
--
-- `blockSubject` (lib/inquiry/recipient-safety.ts) upserts into user_blocks with
-- ON CONFLICT on (tenant_id, blocker_user_id, blocked_client_user_id), and the
-- matching unique indexes were PARTIAL:
--
--   CREATE UNIQUE INDEX user_blocks_client_uniq ON user_blocks
--     (tenant_id, blocker_user_id, blocked_client_user_id)
--     WHERE (blocked_client_user_id IS NOT NULL)
--
-- Postgres will not infer a partial index for ON CONFLICT unless the statement
-- repeats the index predicate, and PostgREST never sends one. So every single
-- block failed at PLANNING with 42P10, before touching a row. Reproduced
-- against production before writing this:
--
--   ERROR: 42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- `user_blocks` holds 0 rows platform-wide, which is the evidence that no block
-- has ever landed. This is a user-safety writer: somebody asked not to hear from
-- someone, the UI said it worked, and nothing was written.
--
-- THE FIX, AND WHY IT IS SAFE. The predicate is dropped and the indexes become
-- total. For real values the uniqueness is identical. For NULLs the behaviour is
-- also unchanged: the partial index excluded those rows, and a total index
-- treats NULLs as distinct, so neither ever conflicts. `user_blocks_subject_xor`
-- already guarantees exactly one of the two subject columns is non-null, so the
-- unused column is NULL on every row by construction.

drop index if exists public.user_blocks_client_uniq;
drop index if exists public.user_blocks_guest_uniq;

create unique index user_blocks_client_uniq
  on public.user_blocks (tenant_id, blocker_user_id, blocked_client_user_id);

create unique index user_blocks_guest_uniq
  on public.user_blocks (tenant_id, blocker_user_id, blocked_guest_session_id);

-- The migration proves its own claim before it is allowed to succeed.
--
-- Run the exact statement the application runs, with an impossible tenant. If
-- ON CONFLICT can now infer the index, the ONLY remaining objection is the
-- foreign key, so the expected failure is 23503. If we still get 42P10 the
-- inference is still broken and this migration must not report success.
do $$
begin
  begin
    insert into public.user_blocks
      (tenant_id, blocker_user_id, blocked_client_user_id, blocked_subject_type, scope)
    values
      ('00000000-0000-0000-0000-0000000000ff'::uuid,
       '00000000-0000-0000-0000-0000000000fe'::uuid,
       '00000000-0000-0000-0000-0000000000fd'::uuid,
       'client_user', 'messaging')
    on conflict (tenant_id, blocker_user_id, blocked_client_user_id) do nothing;
    raise exception 'probe wrote a row with an impossible tenant; the FK is missing';
  exception
    when foreign_key_violation then
      null;  -- 23503: ON CONFLICT resolved, only the FK objected. Correct.
    when invalid_column_reference then
      raise exception 'ON CONFLICT still cannot infer user_blocks_client_uniq (42P10)';
  end;

  begin
    insert into public.user_blocks
      (tenant_id, blocker_user_id, blocked_guest_session_id, blocked_subject_type, scope)
    values
      ('00000000-0000-0000-0000-0000000000ff'::uuid,
       '00000000-0000-0000-0000-0000000000fe'::uuid,
       '00000000-0000-0000-0000-0000000000fc'::uuid,
       'guest_session', 'messaging')
    on conflict (tenant_id, blocker_user_id, blocked_guest_session_id) do nothing;
    raise exception 'probe wrote a guest row with an impossible tenant; the FK is missing';
  exception
    when foreign_key_violation then
      null;
    when invalid_column_reference then
      raise exception 'ON CONFLICT still cannot infer user_blocks_guest_uniq (42P10)';
  end;
end $$;
