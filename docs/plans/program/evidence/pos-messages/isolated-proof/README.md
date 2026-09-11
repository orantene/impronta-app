# POS Messages (PR #1961) — isolated-branch proof

This proof was run together with Package 3 (engine-venue, PR #1960) in one
worktree, since both merge into the same eight migrations and share fixture
setup. Full detail — migration apply log (including the enum-cast fix this
package's own migration needed), the object/privilege/RLS check, the merge
conflict resolution for `docs/plans/program/pos/decisions.md`, all seven
`verify-*.mjs` scripts, and every one-path check — is in:

[`../../engine-venue/isolated-proof/README.md`](../../engine-venue/isolated-proof/README.md)

## What's specific to this package

Migration: `20261231222000_pos_messaging_state.sql` (the only migration of
the eight owned by this package; the other seven belong to engine-venue).
Required a root-cause fix before it applied — two enum columns
(`inquiries.source_channel`, `inquiry_offers.status`) were compared directly
against string literals that aren't members of those enums on this branch
(`'web_chat'`/`'sms'`/`'counter'` and `'pending'`/`'approved'`). Fixed by
casting both to `text` before the comparison, matching the existing
`p_inquiry.status::text` pattern already used in the same function. See the
companion README for the full error and fix detail.

Objects this migration creates (all confirmed to exist, RLS-enabled with a
staff SELECT policy, and service_role-only on privileges — see the shared
README's Task 3 table for the full 18-table / 35-function check, this
package's slice is):

- Tables: `checkout_snapshots`, `conversation_identity`, `conversation_records`,
  `message_delivery`, `scheduled_messages`.
- Functions: `messaging_assign_owner`, `messaging_auto_cancel_reminders`,
  `messaging_close_lost`, `messaging_derive_opportunity_state`,
  `messaging_link_record`, `messaging_recover_from_snapshot`,
  `messaging_set_conversation_state`, `messaging_set_identity`,
  `messaging_touch_inquiry_from_message`, `messaging_touch_opportunity`,
  `messaging_unlink_record`.

## Messaging-specific one-path checks (also in the shared README)

- **Conversation state trigger** (`messaging_touch_inquiry_from_message`,
  fired by `inquiry_messages_touch_conversation` on `inquiry_messages`
  insert): a customer message (`sender_user_id IS NULL`) flips
  `conversation_state` to `needs_reply`; a staff message
  (`sender_user_id` set) flips it to `awaiting_customer`. Both directions
  exercised on one fixture `inquiries` row, ground truth read after each
  insert.
- **One `scheduled_messages` row per record**: enforced by the partial
  unique index `scheduled_messages_one_live_per_record`
  (`(tenant_id, record_kind, record_id) WHERE state = 'scheduled' AND
  record_id IS NOT NULL`). A second insert for the same record while the
  first is still `scheduled` was refused `23505`.

## Merge note

The task named branch head `843d042c8`. `git fetch origin
cursor/pos-messages-444f` at the start of this session already resolved to
`d415969c5` ("messaging: serve customer cards at /c/t/<token>") — a route
collision fix (`/c/[token]` → `/c/t/[token]`, `next 16` rejects two
`/c/[*]` routes) plus one more decision entry, both already reconciled in
the merge onto `engine/venue-messages-proofs`. Verified: exactly one
`/c/t/<token>` route on disk, one `D-POS-82` heading in `decisions.md`
(the engine-venue one; this package's D-POS-76..82 were renumbered to
D-POS-83..89 during the merge — see the shared README).
