-- Messages Consolidation Plan v2 — emoji reactions (item #10).
--
-- Persists the 6-emoji + custom WhatsApp-style reactions shipped via
-- `<MessageReactionMenu>` / `<ReactionPicker>` / `<ReactionChips>`.
--
-- One reaction per (message, user, emoji). Each message can carry
-- multiple emojis from the same user (matches WhatsApp behavior in
-- recent versions). RLS mirrors the underlying message visibility:
-- if you can SELECT the message, you can SELECT its reactions.

BEGIN;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inquiry_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_by_message
  on public.message_reactions (message_id);

create index if not exists message_reactions_by_user
  on public.message_reactions (user_id, created_at desc);

alter table public.message_reactions enable row level security;

-- SELECT: piggyback on the message visibility. We can't directly
-- reference the inquiry_messages policies from another table, so we
-- check the same conditions: participants on the inquiry (any thread).
-- Service-role bypasses RLS for engine paths.
drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions
  for select using (
    exists (
      select 1 from public.inquiry_messages m
      join public.inquiry_participants p
        on p.inquiry_id = m.inquiry_id
        and p.user_id = auth.uid()
        and p.status in ('active', 'invited')
      where m.id = message_reactions.message_id
    )
  );

-- INSERT: must be acting as yourself + must be a participant on the
-- inquiry whose message you're reacting to + must satisfy the
-- thread visibility rule (no reacting to a Client thread message
-- if you're not a coordinator).
drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.inquiry_messages m
      join public.inquiry_participants p
        on p.inquiry_id = m.inquiry_id
        and p.user_id = auth.uid()
        and p.status in ('active', 'invited')
      where m.id = message_reactions.message_id
        and (
          -- Group thread: any participant except clients
          (m.thread_type = 'group' and p.role <> 'client')
          -- Private/Client thread: clients + coordinators
          or (m.thread_type = 'private' and p.role in ('client', 'coordinator'))
        )
    )
  );

-- DELETE: only your own reactions
drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions
  for delete using (user_id = auth.uid());

comment on table public.message_reactions is
  'Emoji reactions on inquiry_messages. WhatsApp-style — one row per (message, user, emoji). See web/src/components/chat-interactions/MessageReactions.tsx.';

COMMIT;
