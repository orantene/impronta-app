-- Messages Consolidation Plan v2 — reply-to-message wiring (item #9).
--
-- Adds `reply_to_message_id` to `inquiry_messages` so the WhatsApp-
-- style quoted-reply feature shipped via `<ReplyContextBar>` and
-- `<QuotedMessage>` (chat-interactions primitives) can persist.
--
-- Self-referential FK with ON DELETE SET NULL — if the original
-- message gets deleted (e.g. moderator removes it), the reply still
-- exists but loses its quote anchor (renders as a normal message).

BEGIN;

alter table public.inquiry_messages
  add column if not exists reply_to_message_id uuid
    references public.inquiry_messages(id) on delete set null;

create index if not exists inquiry_messages_reply_to_idx
  on public.inquiry_messages (reply_to_message_id)
  where reply_to_message_id is not null;

comment on column public.inquiry_messages.reply_to_message_id is
  'When set, this message is a quoted reply to another message in the same thread. Renders <QuotedMessage> at the top of the bubble. See web/src/components/chat-interactions/ReplyToMessage.tsx.';

COMMIT;
