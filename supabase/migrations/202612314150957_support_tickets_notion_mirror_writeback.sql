-- TUL-45 follow-up: stop perpetual re-sync on Notion writeback + due-list SQL.
-- Keeps 20261231349000_support_tickets_notion_mirror.sql untouched (already applied).
-- PM applies before merge via: cd web && npm run db:push

-- 1) Touch trigger: do not bump updated_at when only Notion mirror columns change.
CREATE OR REPLACE FUNCTION public.support_tickets_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Compare row payloads ignoring updated_at + Notion bookkeeping. If nothing
  -- else changed, preserve OLD.updated_at so writeback cannot re-queue itself.
  IF (to_jsonb(NEW) - 'updated_at' - 'notion_page_id' - 'notion_synced_at')
     IS NOT DISTINCT FROM
     (to_jsonb(OLD) - 'updated_at' - 'notion_page_id' - 'notion_synced_at')
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

-- 2) Due index matches the full predicate used by the list RPC.
drop index if exists public.support_tickets_notion_sync_due_idx;

create index if not exists support_tickets_notion_sync_due_idx
  on public.support_tickets (updated_at asc)
  where notion_page_id is null
     or notion_synced_at is null
     or updated_at > notion_synced_at;

comment on column public.support_tickets.notion_synced_at is
  'When this ticket was last successfully pushed to Notion. Null means never synced. A failed push leaves the previous value unchanged.';

-- 3) SQL-side due page (oldest first) so cron does not scan newest-N then filter in memory.
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
  where t.notion_page_id is null
     or t.notion_synced_at is null
     or t.updated_at > t.notion_synced_at
  order by t.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

comment on function public.list_support_tickets_notion_mirror_due(int) is
  'TUL-45: oldest due Support tickets for the one-way Notion mirror cron (service_role only).';

revoke all on function public.list_support_tickets_notion_mirror_due(int) from public;
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
    notion_synced_at = now()
  where t.id = p_id
  returning t.id, t.updated_at, t.notion_page_id, t.notion_synced_at;
end;
$$;

comment on function public.mark_support_ticket_notion_mirrored(uuid, text) is
  'TUL-45: persist Notion page id + synced_at without advancing support_tickets.updated_at.';

revoke all on function public.mark_support_ticket_notion_mirrored(uuid, text) from public;
grant execute on function public.mark_support_ticket_notion_mirrored(uuid, text) to service_role;
