-- TUL-45: one-way Support Desk → Notion mirror bookkeeping.
-- Stores the Notion page id so cron updates match; Notion never writes back.
-- PM applies via db:push. Soft-null until first successful sync.

alter table public.support_tickets
  add column if not exists notion_page_id text,
  add column if not exists notion_synced_at timestamptz;

comment on column public.support_tickets.notion_page_id is
  'Notion page id for the one-way Support tickets mirror (TUL-45). Never read as a write-back source.';

comment on column public.support_tickets.notion_synced_at is
  'When this ticket was last successfully pushed to Notion. Null means never synced or last push failed.';

create index if not exists support_tickets_notion_sync_due_idx
  on public.support_tickets (updated_at desc)
  where notion_page_id is null or notion_synced_at is null;
