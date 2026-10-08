-- TUL-45 follow-up: stop perpetual re-sync on Notion writeback + due-list SQL.
-- Keeps 20261231349000_support_tickets_notion_mirror.sql untouched (already applied).
-- PM applies before merge via: cd web && npm run db:push
--
-- Timestamp note: wall-clock `date -u +%Y%m%d%H%M%S` sorts before the future-dated
-- migration band on main (head 20261231349151). Use 20261231415100 (14 digits)
-- so this file sorts after head. Renamed from typo 202612314150957 (15 digits).

-- 0) Failure backoff bookkeeping so permanent Notion failures cannot starve the
--    oldest-first due page (limit 50) forever.
alter table public.support_tickets
  add column if not exists notion_sync_last_failed_at timestamptz;

comment on column public.support_tickets.notion_sync_last_failed_at is
  'When the Notion mirror cron last failed for this ticket. Due list skips rows failed within the last 15 minutes unless updated_at is newer (TUL-45).';

-- 1) Touch trigger: do not bump updated_at when only Notion mirror columns change.
CREATE OR REPLACE FUNCTION public.support_tickets_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Compare row payloads ignoring updated_at + Notion bookkeeping. If nothing
  -- else changed, preserve OLD.updated_at so writeback cannot re-queue itself.
  IF (to_jsonb(NEW) - 'updated_at' - 'notion_page_id' - 'notion_synced_at' - 'notion_sync_last_failed_at')
     IS NOT DISTINCT FROM
     (to_jsonb(OLD) - 'updated_at' - 'notion_page_id' - 'notion_synced_at' - 'notion_sync_last_failed_at')
  THEN
    NEW.updated_at = OLD.updated_at;
    RETURN NEW;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

comment on function public.support_tickets_touch_updated_at() is
  'Bumps updated_at on real ticket edits; skips when only Notion mirror bookkeeping columns change (TUL-45).';

-- 2) Due index matches the full predicate used by the list RPC (incl. backoff).
drop index if exists public.support_tickets_notion_sync_due_idx;

create index if not exists support_tickets_notion_sync_due_idx
  on public.support_tickets (updated_at asc)
  where notion_page_id is null
     or notion_synced_at is null
     or updated_at > notion_synced_at;

comment on column public.support_tickets.notion_synced_at is
  'When this ticket was last successfully pushed to Notion. Null means never synced. A failed push leaves the previous value unchanged.';

-- 3) SQL-side due page (oldest first) so cron does not scan newest-N then filter in memory.
--    Skip recently failed rows (15m) unless the ticket was edited after the failure.
create or replace function public.list_support_tickets_notion_mirror_due(p_limit int default 50)
returns table (
  id uuid,
  ticket_number bigint,
  subject text,
  status text,
  category text,
  created_at timestamptz,
  updated_at timestamptz,
  notion_page_id text,
  notion_synced_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.ticket_number,
    t.subject,
    t.status,
    t.category,
    t.created_at,
    t.updated_at,
    t.notion_page_id,
    t.notion_synced_at
  from public.support_tickets t
  where (
         t.notion_page_id is null
      or t.notion_synced_at is null
      or t.updated_at > t.notion_synced_at
  )
  and (
         t.notion_sync_last_failed_at is null
      or t.notion_sync_last_failed_at < now() - interval '15 minutes'
      or t.updated_at > t.notion_sync_last_failed_at
  )
  order by t.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

comment on function public.list_support_tickets_notion_mirror_due(int) is
  'TUL-45: oldest due Support tickets for the one-way Notion mirror cron (service_role only). Skips rows failed within 15 minutes unless edited since.';

-- Default privileges grant EXECUTE to anon/authenticated at CREATE time; revoke
-- PUBLIC alone leaves those direct grants (see 20261231281000).
revoke all on function public.list_support_tickets_notion_mirror_due(int)
  from public, anon, authenticated;
grant execute on function public.list_support_tickets_notion_mirror_due(int) to service_role;

-- 4) Atomic writeback: set page id + synced_at = now() in SQL (trigger skips updated_at bump).
create or replace function public.mark_support_ticket_notion_mirrored(
  p_id uuid,
  p_page_id text
)
returns table (
  id uuid,
  updated_at timestamptz,
  notion_page_id text,
  notion_synced_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_page_id is null or length(trim(p_page_id)) = 0 then
    raise exception 'mark_support_ticket_notion_mirrored: page id required';
  end if;

  return query
  update public.support_tickets t
  set
    notion_page_id = trim(p_page_id),
    notion_synced_at = now(),
    notion_sync_last_failed_at = null
  where t.id = p_id
  returning t.id, t.updated_at, t.notion_page_id, t.notion_synced_at;
end;
$$;

comment on function public.mark_support_ticket_notion_mirrored(uuid, text) is
  'TUL-45: persist Notion page id + synced_at without advancing support_tickets.updated_at.';

revoke all on function public.mark_support_ticket_notion_mirrored(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_support_ticket_notion_mirrored(uuid, text) to service_role;

-- 5) Record a failed push so the due page can back off without starving newer tickets.
create or replace function public.mark_support_ticket_notion_mirror_failed(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_tickets t
  set notion_sync_last_failed_at = now()
  where t.id = p_id;
end;
$$;

comment on function public.mark_support_ticket_notion_mirror_failed(uuid) is
  'TUL-45: stamp last Notion mirror failure for due-list backoff (service_role only).';

revoke all on function public.mark_support_ticket_notion_mirror_failed(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_support_ticket_notion_mirror_failed(uuid) to service_role;
