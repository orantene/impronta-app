# Decisions (append only)

D-MSG-1 · 2026-09-17 · Owner decisions 1–14 recorded in README.md are binding.

D-MSG-2 · 2026-09-17 (S4) · No `subject`/`title`/`project_label` column exists on `inquiries` —
grepped every `ALTER TABLE public.inquiries` and the init `CREATE TABLE` across all of
`supabase/migrations/*.sql`; the only free-text columns are `contact_name`, `company`,
`message`, `staff_notes`, none of which fit. Per Principle 0 / lane rules, `messagingRename`
does not add a column. Instead the internal name is event-sourced off `inquiry_action_log`
(`action_type = 'messaging_rename'`, `metadata: { old, new }`); the current name is the latest
successful rename's `metadata.new`, falling back to `contact_name` (the existing fallback
`loadMessagingInbox.subject` already uses). The write is still version-locked on the inquiry's
own `version` column even though no inquiry column's *value* changes — see
`web/src/lib/messaging/inquiry-name.ts` and `rename.ts`.

D-MSG-3 · 2026-09-17 (S4) · `inquiry_action_log`'s own migration comment says the table is
"Never user-visible in Phase 1" (distinct from `inquiry_events`, which is described as
user-visible/success-only). `loadConversationHistory` reads this as "never shown to the
CLIENT", not "never shown to staff" — it is a staff-only, `staff()`-guarded workspace reader
(`web/src/lib/messaging/history.ts`), not a customer-facing surface. Flagging this explicitly
since it is an interpretation of another lane's/an earlier migration's comment, not a rule this
lane wrote.

D-MSG-4 · 2026-09-17 (S4) · `messagingMerge`'s "refuses if either has a paid or confirmed
record" guard is real only for `order` (`orders.status` paid/fulfilled/partially_refunded) and
`offer` (`inquiry_offers.status` accepted) — the two record kinds with an actual status column
reachable in one hop. `appointment` / `reservation` / `class_enrolment` / `tickets` / `project`
have no dedicated status table wired into Messages v5 yet; `RecordChip.paymentState` /
`fulfilmentState` are `null` everywhere in the existing engine too (see `inbox.ts loadChips`,
`essentials.ts` — pre-existing, not introduced by S4). Those five kinds are **not checked** by
the merge guard; a merge that should have been blocked on one of them will not be. Documented
in `web/src/lib/messaging/merge.ts`, not silently assumed safe. A future lane that wires a
status table for one of these kinds should extend `eitherHasPaidOrConfirmedRecord`.

D-MSG-5 · 2026-09-17 (S4) · `loadConversationHistory` needs assignment/handover/resolve/
reopen/close-lost events, but `messaging_assign_owner`, `messaging_set_conversation_state` and
`messaging_close_lost` (the existing RPCs in `20261231222000_pos_messaging_state.sql`) write
only to `inquiries`, never to `inquiry_action_log` or `inquiry_events`. Editing those RPCs
would be a migration; instead `messagingAssignOwner`/`messagingHandOver`/`messagingResolve`/
`messagingReopen`/`messagingCloseLost` in `messaging-engine.ts` now write a best-effort
`inquiry_action_log` row themselves, right after the RPC succeeds (never before, never blocking
the RPC's own result on the log write). `messagingAssignOwner` and `messagingHandOver` share
one `assignOwnerCore(input, handover: boolean)` so the log can tell the two apart.

D-MSG-6 · 2026-09-17 (S4) · Tooling note: this worktree's `web/node_modules` symlink was found
pointing at an incomplete install (missing `tsx`, `eslint` binaries; `next`'s compiled
`server-only` stub directory was empty), so `npm run test:messaging` / `test:inquiry-workspace`
/ `lint` all failed with `ENOENT`/`MODULE_NOT_FOUND` — reproduced identically on pre-existing,
untouched files (`inbox-unread.test.ts`, `sheets.test.ts`), so it was environmental, not this
lane's code. The coordinator repointed the symlink mid-session; all three gates then passed
clean (see lanes.md for exit codes). Logic was verified independently beforehand with a
throwaway `server-only`-stub `--require` shim (not committed) run against `src/lib/messaging/*.test.ts`
directly via `npx tsx --test`: 74/74 passing before the symlink fix, confirming the earlier
failures were infra, not S4 code.
