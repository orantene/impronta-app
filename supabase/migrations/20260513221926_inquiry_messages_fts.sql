-- Phase F item 28 scaffold — Postgres FTS index on inquiry_messages.body
-- so the existing ThreadSearch primitive (which is client-side filter
-- today) can be backed by real inbox-wide search in a future slice.

BEGIN;

-- Generated tsvector column maintained automatically by the engine.
alter table public.inquiry_messages
  add column if not exists body_tsv tsvector
    generated always as (to_tsvector('english', coalesce(body, ''))) stored;

create index if not exists inquiry_messages_body_tsv_idx
  on public.inquiry_messages using gin (body_tsv);

-- Helper RPC: search messages the caller is allowed to read across
-- the inquiries they have access to. RLS on inquiry_messages still
-- gates visibility — this just adds the FTS ranking.
create or replace function public.search_inquiry_messages(
  p_query text,
  p_limit int default 50
)
  returns table (
    id uuid,
    inquiry_id uuid,
    body text,
    created_at timestamptz,
    sender_user_id uuid,
    rank real
  )
  language plpgsql
  stable
  security invoker
as $$
begin
  return query
  select m.id, m.inquiry_id, m.body, m.created_at, m.sender_user_id,
         ts_rank(m.body_tsv, plainto_tsquery('english', p_query)) as rank
  from public.inquiry_messages m
  where m.body_tsv @@ plainto_tsquery('english', p_query)
    and m.deleted_at is null
  order by rank desc, m.created_at desc
  limit p_limit;
end;
$$;

grant execute on function public.search_inquiry_messages(text, int) to authenticated;

comment on function public.search_inquiry_messages(text, int) is
  'Inbox-wide FTS over messages the caller is permitted to read. RLS on inquiry_messages enforces visibility. Phase F item 28 scaffold.';

COMMIT;
