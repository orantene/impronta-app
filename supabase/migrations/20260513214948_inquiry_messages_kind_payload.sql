-- Messages Consolidation Plan v2 — Item #4
-- Adds `message_kind` discriminator + `card_payload jsonb` to
-- inquiry_messages so the conversation stream can render structured
-- chat cards (Offer / PaymentRequest / CoordinatorRequest / TalentRate /
-- CallSheetUpdate / SystemEvent) instead of plain text for workflow
-- moments.
--
-- The engine emits typed messages (e.g. when an offer is sent it
-- inserts a message with kind='offer_event' and payload {offer_id,
-- status, total_cents}). The render layer in AdminMessageStream +
-- ConversationTab + ClientThreadAdapter switches on the kind to
-- render the appropriate <ChatCard> from `web/src/components/chat-cards`.
--
-- Default is 'text' so existing rows + new plain messages are
-- back-compat.

BEGIN;

alter table public.inquiry_messages
  add column if not exists message_kind text not null default 'text'
    check (message_kind in (
      'text',
      'offer_event',
      'payment_request',
      'payment_paid',
      'coordinator_request',
      'talent_rate',
      'call_sheet_update',
      'booking_status',
      'system_event'
    )),
  add column if not exists card_payload jsonb;

create index if not exists inquiry_messages_kind_idx
  on public.inquiry_messages (inquiry_id, message_kind)
  where message_kind <> 'text';

comment on column public.inquiry_messages.message_kind is
  'Render discriminator for the conversation stream. text = plain bubble; everything else triggers a typed ChatCard render (see web/src/components/chat-cards/).';

comment on column public.inquiry_messages.card_payload is
  'JSON payload for typed cards (e.g. {offer_id, status, total_cents} for offer_event). Schema is per-kind, validated at the engine layer where the row is inserted.';

COMMIT;
