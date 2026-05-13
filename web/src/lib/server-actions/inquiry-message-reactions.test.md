# inquiry-message-reactions — acceptance checklist

Future test wiring reference for message-reactions server actions.

## Acceptance

- [ ] `addReaction` inserts a row into `message_reactions` with correct (message_id, user_id, emoji)
- [ ] `addReaction` returns `{ ok: true }` on success and calls `revalidatePath`
- [ ] `removeReaction` deletes only the row matching (message_id, auth.uid, emoji) — does not affect other users' reactions
- [ ] `removeReaction` returns `{ ok: true }` even when no row matched (idempotent delete)
- [ ] RLS blocks a non-participant from inserting into `message_reactions` (expect Postgres policy violation)
- [ ] RLS blocks a client user from reacting to a message in a group/internal thread they cannot view
- [ ] Both actions return `{ ok: false, error: "Not authenticated." }` when called without a valid session
- [ ] `sendMessage` with `replyToMessageId` persists `reply_to_message_id` on the inserted row
- [ ] `sendMessage` without `replyToMessageId` inserts with `reply_to_message_id = null` (no regression)
- [ ] ON DELETE SET NULL behaviour: deleting the parent message nullifies `reply_to_message_id` on child rows
