-- `list_applied_migrations_named()` — the migration ledger WITH names.
-- IT Integration and Security Director, 2026-09-06.
--
-- The existing `list_applied_migrations()` returns TABLE(version text) and
-- nothing else, which is exactly why the collision class it was meant to guard
-- against went unnoticed: a local file whose version is recorded under ANOTHER
-- migration's name reads as applied, forever. Four such files were found on
-- origin/main on 2026-09-06 with their objects genuinely missing from
-- production, while `db:check` reported zero pending.
--
-- A new function rather than a changed return type: replacing the shape of
-- `list_applied_migrations()` would break the older caller the moment either
-- side lags the other, and contract changes are code-first here.
--
-- Numbered above the tree maximum on purpose, like 20261230000000, because the
-- tree contains future-dated migrations and a `date -u` timestamp would sort
-- into the wrong place.

create or replace function public.list_applied_migrations_named()
returns table (version text, name text)
language plpgsql
security definer
set search_path = public, supabase_migrations
as $$
begin
  return query
    select m.version::text, coalesce(m.name, '')::text
    from supabase_migrations.schema_migrations m
    order by m.version asc;
end;
$$;

-- Read of the migration ledger is an operator capability, not a public one.
-- Revoke FROM PUBLIC first: a grant held through PUBLIC makes REVOKE FROM anon
-- a no-op, which is the trap this repo has already paid for.
revoke all on function public.list_applied_migrations_named() from public, anon, authenticated;
grant execute on function public.list_applied_migrations_named() to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.list_applied_migrations_named()', 'EXECUTE') then
    raise exception 'list_applied_migrations_named is anon-executable';
  end if;
  if has_function_privilege('authenticated', 'public.list_applied_migrations_named()', 'EXECUTE') then
    raise exception 'list_applied_migrations_named is authenticated-executable';
  end if;
  if not has_function_privilege('service_role', 'public.list_applied_migrations_named()', 'EXECUTE') then
    raise exception 'list_applied_migrations_named lost service_role execute';
  end if;
end $$;
